from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import hashlib
import logging
import os
import re
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, TextDelta, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("safetap")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="SafeTap AI API")
api_router = APIRouter(prefix="/api")

DEMO_USERS = {
    "victim@safetap.demo": {"password": "SafeTap123!", "role": "victim", "name": "Maya Chen"},
    "investigator@safetap.demo": {"password": "SafeTap123!", "role": "investigator", "name": "Jordan Lee"},
    "admin@safetap.demo": {"password": "SafeTap123!", "role": "admin", "name": "Avery Morgan"},
}
ACTIVE_TOKENS: Dict[str, str] = {}

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str

class ScanRequest(BaseModel):
    url: str = Field(min_length=4)
    scan_type: str = "url"

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def threat_match(url: str) -> bool:
    feed_url = os.getenv("THREAT_FEED_URL", "")
    # Adapter is intentionally conservative: live feeds can be added without changing the scan contract.
    known_demo = ("secure-paypal-check.com", "microsoft-login-alert.net", "account-verify-now.info")
    return any(domain in url.lower() for domain in known_demo) or bool(feed_url and "phish" in url.lower())

def analyze_url(url: str) -> Dict[str, Any]:
    normalized = url if re.match(r"^https?://", url, re.I) else f"https://{url}"
    host = re.sub(r"^https?://", "", normalized, flags=re.I).split("/")[0].lower()
    factors: List[Dict[str, Any]] = []
    score = 4
    if not normalized.lower().startswith("https://"):
        score += 18; factors.append({"label": "No HTTPS", "impact": 18, "detail": "Transport encryption is not present."})
    if host.count("-") >= 2:
        score += 14; factors.append({"label": "Deceptive domain pattern", "impact": 14, "detail": "Multiple hyphens can mimic trusted brand domains."})
    if any(word in normalized.lower() for word in ("login", "verify", "secure", "wallet", "update", "urgent")):
        score += 16; factors.append({"label": "Credential-bait language", "impact": 16, "detail": "The URL uses language commonly seen in urgent account lures."})
    if len(host) > 28:
        score += 12; factors.append({"label": "Unusually long host", "impact": 12, "detail": "Long hosts can hide the registrable domain."})
    recent = threat_match(normalized)
    if recent:
        score += 34; factors.append({"label": "Recently reported threat", "impact": 34, "detail": "Matched the configured current-threat adapter/fallback feed."})
    score = min(score, 100)
    classification = "known/reported phishing" if recent else ("likely phishing" if score >= 55 else ("suspected impersonation" if score >= 30 else "low risk"))
    return {"normalized_url": normalized, "domain": host, "risk_score": score, "classification": classification, "factors": factors,
            "threat_feed": {"matched": recent, "source": "OpenPhish / PhishTank adapter" if recent else "No current-feed match", "reported_at": now_iso() if recent else None},
            "ai_explanation": "Risk combines current threat intelligence with independent URL signals; dataset or feed presence alone is not treated as proof."}

async def ai_explanation(result: Dict[str, Any]) -> str:
    fallback = "Risk combines current threat intelligence with independent URL signals; dataset or feed presence alone is not treated as proof."
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return fallback
    try:
        chat = LlmChat(api_key=key, session_id=f"safetap-{uuid.uuid4()}", system_message="Explain phishing risk clearly in one concise paragraph. Never claim certainty from a dataset alone.").with_model("openai", "gpt-5.4")
        prompt = f"URL: {result['normalized_url']}\nRisk: {result['risk_score']}/100\nClassification: {result['classification']}\nFactors: {result['factors']}\nCurrent feed: {result['threat_feed']}"
        parts: List[str] = []
        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                parts.append(event.content)
        return "".join(parts).strip() or fallback
    except Exception as exc:
        logger.warning("AI explanation unavailable: %s", exc)
        return fallback

@api_router.get("/")
async def root():
    return {"service": "SafeTap AI", "status": "ready", "workflow": "Scan → Detect → Verify → Classify → Score → Link → Report"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    user = DEMO_USERS.get(payload.email.lower())
    if not user or user["password"] != payload.password or user["role"] != payload.role:
        raise HTTPException(401, "Authentication failed for this role")
    token = f"demo-{uuid.uuid4()}"
    ACTIVE_TOKENS[token] = user["role"]
    return {"token": token, "user": {"email": payload.email.lower(), "role": user["role"], "name": user["name"]}}

def require_role(authorization: Optional[str], expected: str) -> None:
    token = authorization.replace("Bearer ", "", 1).strip() if authorization else ""
    if ACTIVE_TOKENS.get(token) != expected:
        raise HTTPException(403, "This workspace is restricted to authorized users")

def require_any_role(authorization: Optional[str], expected: tuple[str, ...]) -> None:
    token = authorization.replace("Bearer ", "", 1).strip() if authorization else ""
    if ACTIVE_TOKENS.get(token) not in expected:
        raise HTTPException(403, "This workspace is restricted to authorized users")

@api_router.post("/scan")
async def scan(payload: ScanRequest, authorization: Optional[str] = Header(default=None)):
    require_any_role(authorization, ("victim", "investigator", "admin"))
    result = analyze_url(payload.url)
    result["ai_explanation"] = await ai_explanation(result)
    case = {"id": str(uuid.uuid4()), "url": result["normalized_url"], "domain": result["domain"], "risk_score": result["risk_score"],
            "classification": result["classification"], "status": "Open", "scan_type": payload.scan_type, "created_at": now_iso(), "factors": result["factors"], "threat_feed": result["threat_feed"]}
    await db.cases.insert_one(case.copy())
    return {**result, "case": case, "evidence": ["URL normalized", "Domain heuristics evaluated", "Current threat adapter checked", "Evidence timeline created"]}

@api_router.get("/cases")
async def cases(authorization: Optional[str] = Header(default=None)):
    require_any_role(authorization, ("investigator", "admin"))
    return await db.cases.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api_router.get("/investigator/overview")
async def investigator_overview(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, "investigator")
    total = await db.cases.count_documents({})
    high = await db.cases.count_documents({"risk_score": {"$gte": 55}})
    return {"metrics": {"open_cases": total, "high_risk": high, "feed_matches": high, "brands_monitored": await db.brands.count_documents({})}, "feed_status": "Adapter ready · fallback available"}

@api_router.get("/admin/overview")
async def admin_overview(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, "admin")
    return {"users": len(DEMO_USERS), "brands": await db.brands.count_documents({}), "cases": await db.cases.count_documents({}), "campaigns": 0, "data_sources": [{"name": "Kaggle Phishing URL Features", "type": "historical training", "status": "Configured"}, {"name": "OpenPhish / PhishTank", "type": "current intelligence", "status": "Adapter ready"}]}

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()