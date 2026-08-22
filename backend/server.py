from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import base64
import hashlib
import io
import logging
import os
import re
import tempfile
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import (
    ImageContent,
    LlmChat,
    TextDelta,
    UserMessage,
)
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech

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
# token -> {"role": ..., "email": ...}
ACTIVE_TOKENS: Dict[str, Dict[str, str]] = {}

# Indian languages supported by the voice assistant
LANGUAGE_MAP = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "kn": "Kannada",
    "ml": "Malayalam",
    "gu": "Gujarati",
    "pa": "Punjabi",
}


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


class ScanRequest(BaseModel):
    url: str = Field(min_length=4)
    scan_type: str = "url"


class ScreenshotScanRequest(BaseModel):
    image_base64: str
    filename: Optional[str] = None


class SocialScanRequest(BaseModel):
    post_url: Optional[str] = None
    post_text: Optional[str] = None
    platform: Optional[str] = None


class VoiceReplyRequest(BaseModel):
    text: str
    language: str = "en"
    voice: str = "nova"


class VoiceTranscribeRequest(BaseModel):
    audio_base64: str
    audio_format: str = "webm"
    language: Optional[str] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────
# URL / threat-feed heuristics (existing, extended)
# ─────────────────────────────────────────────────────────────
def threat_match(url: str) -> bool:
    feed_url = os.getenv("THREAT_FEED_URL", "")
    known_demo = (
        "secure-paypal-check.com",
        "microsoft-login-alert.net",
        "account-verify-now.info",
        "sbi-secure-update.com",
        "hdfc-verify-account.net",
    )
    return any(domain in url.lower() for domain in known_demo) or bool(
        feed_url and "phish" in url.lower()
    )


# ─────────────────────────────────────────────────────────────
# Brand lookalike / typosquat helpers
# ─────────────────────────────────────────────────────────────
BRANDS = {
    "paypal", "microsoft", "google", "apple", "amazon", "netflix", "facebook",
    "instagram", "whatsapp", "linkedin", "twitter", "outlook", "gmail", "yahoo",
    "dropbox", "adobe", "github", "sbi", "hdfc", "icici", "axis", "kotak",
    "bankofamerica", "chase", "wellsfargo", "paytm", "phonepe", "gpay",
    "flipkart", "myntra", "airbnb", "uber", "swiggy", "zomato", "netbanking",
}

# Domains that host the brand legitimately — used to avoid false positives.
OFFICIAL_HOSTS = {
    "paypal": {"paypal.com"},
    "microsoft": {"microsoft.com", "live.com", "office.com", "outlook.com"},
    "google": {"google.com", "youtube.com", "gmail.com"},
    "apple": {"apple.com", "icloud.com"},
    "amazon": {"amazon.com", "amazon.in", "amazon.co.uk"},
    "netflix": {"netflix.com"},
    "facebook": {"facebook.com", "fb.com"},
    "instagram": {"instagram.com"},
    "whatsapp": {"whatsapp.com"},
    "linkedin": {"linkedin.com"},
    "twitter": {"twitter.com", "x.com"},
    "outlook": {"outlook.com"},
    "gmail": {"gmail.com"},
    "sbi": {"onlinesbi.sbi", "sbi.co.in"},
    "hdfc": {"hdfcbank.com"},
    "icici": {"icicibank.com"},
    "axis": {"axisbank.com"},
    "paytm": {"paytm.com"},
    "phonepe": {"phonepe.com"},
    "flipkart": {"flipkart.com"},
    "github": {"github.com"},
    "adobe": {"adobe.com"},
    "dropbox": {"dropbox.com"},
}

SUSPICIOUS_TLDS = {
    "xyz", "top", "icu", "tk", "ml", "ga", "cf", "gq", "click", "download",
    "loan", "review", "party", "work", "date", "faith", "science", "stream",
    "racing", "trade", "webcam", "bid", "win", "rest", "quest",
}

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "buff.ly", "cutt.ly",
    "rebrand.ly", "shorte.st", "adf.ly", "is.gd", "v.gd", "tiny.cc",
}

_DIGIT_LOOKALIKE = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def _normalize_for_brand(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower().translate(_DIGIT_LOOKALIKE))


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    dp = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, dp[0] = dp[0], i
        for j, cb in enumerate(b, 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (0 if ca == cb else 1))
            prev = cur
    return dp[-1]


def _registrable(host: str) -> str:
    """Best-effort registrable domain (no PSL): last two labels."""
    parts = host.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


def _brand_lookalike(host: str) -> Optional[Dict[str, Any]]:
    """Return match info if host looks like a known brand but isn't the official host."""
    host = host.lower().strip(".")
    if not host:
        return None
    registrable = _registrable(host)
    labels = [p for p in host.split(".") if p and p not in ("www",)]
    for brand in BRANDS:
        officials = OFFICIAL_HOSTS.get(brand, {f"{brand}.com"})
        if registrable in officials or host in officials:
            return None  # legitimate host, skip this brand
    for brand in BRANDS:
        officials = OFFICIAL_HOSTS.get(brand, {f"{brand}.com"})
        if any(host.endswith(o) for o in officials):
            continue
        norm_labels = [_normalize_for_brand(lbl) for lbl in labels]
        # 1) Direct substring in any label (paypa1-secure → normalized → paypal-secure)
        for lbl, norm in zip(labels, norm_labels):
            if brand in norm and lbl not in officials:
                digit_swap = any(ch.isdigit() or ch in "@$" for ch in lbl)
                return {
                    "brand": brand,
                    "reason": "digit-substitution look-alike" if digit_swap else "brand name inside domain label",
                    "matched_label": lbl,
                }
        # 2) Edit distance ≤ 2 on any label
        for lbl, norm in zip(labels, norm_labels):
            if len(brand) >= 4 and abs(len(norm) - len(brand)) <= 3:
                if _levenshtein(norm, brand) <= 2 and norm != brand:
                    return {
                        "brand": brand,
                        "reason": "typosquatting (edit distance ≤ 2)",
                        "matched_label": lbl,
                    }
    return None


def _is_ip_host(host: str) -> bool:
    return bool(re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host))


def analyze_url(url: str) -> Dict[str, Any]:
    normalized = url if re.match(r"^https?://", url, re.I) else f"https://{url}"
    # Split scheme + rest
    m = re.match(r"^(https?)://([^/?#]+)(.*)$", normalized, re.I)
    scheme = (m.group(1) if m else "https").lower()
    host_full = (m.group(2) if m else normalized).lower()
    path = (m.group(3) if m else "").lower()
    # Strip port
    host = host_full.split(":")[0]
    port = host_full.split(":")[1] if ":" in host_full else ""

    factors: List[Dict[str, Any]] = []
    score = 4
    lower_url = normalized.lower()

    # 1) Transport
    if not lower_url.startswith("https://"):
        score += 18
        factors.append({"label": "No HTTPS", "impact": 18, "detail": "Transport encryption is not present."})

    # 2) IP address in host — very strong signal
    if _is_ip_host(host):
        score += 32
        factors.append({"label": "IP address instead of domain", "impact": 32, "detail": f"Host {host} is a raw IPv4 address."})

    # 3) '@' in URL (credential-redirection trick)
    if "@" in normalized.split("://", 1)[-1]:
        score += 26
        factors.append({"label": "Credential redirect trick", "impact": 26, "detail": "URL contains an '@' before the real host, hiding the true destination."})

    # 4) Punycode / IDN
    if "xn--" in host:
        score += 22
        factors.append({"label": "Punycode / IDN homoglyph", "impact": 22, "detail": "Host uses punycode encoding, sometimes used to imitate real domains."})

    # 5) Suspicious TLD
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    if tld in SUSPICIOUS_TLDS:
        score += 18
        factors.append({"label": "Suspicious TLD", "impact": 18, "detail": f".{tld} is commonly abused for cheap phishing sites."})

    # 6) Brand lookalike
    match = _brand_lookalike(host)
    if match:
        score += 30
        factors.append({
            "label": f"Brand look-alike ({match['brand']})",
            "impact": 30,
            "detail": f"'{match['matched_label']}' → {match['reason']}. Does not match any official {match['brand']} domain.",
        })

    # 7) Excessive subdomains
    label_count = len([p for p in host.split(".") if p])
    if label_count >= 4:
        score += 14
        factors.append({"label": "Excessive subdomains", "impact": 14, "detail": f"{label_count}-part host is a common redirect chain pattern."})

    # 8) Hyphen count
    hyphens = host.count("-")
    if hyphens >= 2:
        score += 12
        factors.append({"label": "Deceptive domain pattern", "impact": 12, "detail": "Multiple hyphens can mimic trusted brand domains."})

    # 9) Credential-bait / urgency language in URL
    URGENT = ("login", "verify", "secure", "wallet", "update", "urgent", "confirm",
              "signin", "auth", "unlock", "bonus", "gift", "prize", "kyc", "otp",
              "password", "recover", "netbanking")
    hits = [w for w in URGENT if w in lower_url]
    if hits:
        impact = min(24, 8 + 4 * len(hits))
        score += impact
        factors.append({"label": "Credential-bait / urgency language", "impact": impact, "detail": f"URL contains: {', '.join(hits[:5])}."})

    # 10) Long host
    if len(host) > 28:
        score += 10
        factors.append({"label": "Unusually long host", "impact": 10, "detail": "Long hosts can hide the registrable domain."})

    # 11) URL shortener
    if any(host == sh or host.endswith("." + sh) for sh in URL_SHORTENERS):
        score += 15
        factors.append({"label": "URL shortener", "impact": 15, "detail": f"{host} is a shortener that hides the destination — cannot verify without following."})

    # 12) Non-standard port
    if port and port not in ("80", "443"):
        score += 12
        factors.append({"label": "Non-standard port", "impact": 12, "detail": f"Port :{port} is unusual for public web traffic."})

    # 13) Double-slash inside path
    if "//" in path:
        score += 8
        factors.append({"label": "Path contains '//'", "impact": 8, "detail": "Extra slashes in the path can redirect through a chain."})

    # 14) Threat feed match
    recent = threat_match(normalized)
    if recent:
        score += 40
        factors.append({"label": "Recently reported threat", "impact": 40, "detail": "Matched the configured current-threat adapter/fallback feed."})

    score = min(score, 100)

    if recent:
        classification = "known/reported phishing"
    elif match and score >= 40:
        classification = "likely phishing"
    elif score >= 55:
        classification = "likely phishing"
    elif score >= 25 or match:
        classification = "suspected impersonation"
    else:
        classification = "low risk"

    return {
        "normalized_url": normalized,
        "domain": host,
        "risk_score": score,
        "classification": classification,
        "factors": factors,
        "brand_lookalike": match,
        "threat_feed": {
            "matched": recent,
            "source": "OpenPhish / PhishTank adapter" if recent else "No current-feed match",
            "reported_at": now_iso() if recent else None,
        },
    }


def fingerprint(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


# ─────────────────────────────────────────────────────────────
# LLM helpers
# ─────────────────────────────────────────────────────────────
async def ai_explanation(result: Dict[str, Any]) -> str:
    fallback = (
        "Risk combines current threat intelligence with independent URL signals; "
        "dataset or feed presence alone is not treated as proof."
    )
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return fallback
    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"safetap-{uuid.uuid4()}",
            system_message="Explain phishing risk clearly in one concise paragraph. Never claim certainty from a dataset alone.",
        ).with_model("openai", "gpt-5.4")
        prompt = (
            f"URL: {result['normalized_url']}\nRisk: {result['risk_score']}/100\n"
            f"Classification: {result['classification']}\nFactors: {result['factors']}\n"
            f"Current feed: {result['threat_feed']}"
        )
        parts: List[str] = []
        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                parts.append(event.content)
        return "".join(parts).strip() or fallback
    except Exception as exc:
        logger.warning("AI explanation unavailable: %s", exc)
        return fallback


async def vision_ocr_and_clone(image_b64: str) -> Dict[str, Any]:
    """Run OCR + brand/clone hints on a screenshot via GPT-4o vision.
    Falls back to deterministic hints when the LLM is unavailable."""
    fallback = {
        "ocr_text": "",
        "detected_brands": [],
        "suspicious_elements": [],
        "clone_confidence": 0,
        "verdict": "Manual review recommended",
        "explanation": "Vision model unavailable; screenshot logged with fingerprint for later inspection.",
    }
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return fallback
    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"safetap-vision-{uuid.uuid4()}",
            system_message=(
                "You are SafeTap's screenshot analyst. Given a screenshot of a possibly cloned website or "
                "phishing page, return STRICT JSON (no markdown) with keys: ocr_text (string, all visible text), "
                "detected_brands (array of {name, similarity_note}), suspicious_elements (array of strings), "
                "clone_confidence (integer 0-100 estimating visual/DOM clone likelihood), verdict (short label), "
                "explanation (2-3 sentences, calibrated). Never claim certainty from visuals alone."
            ),
        ).with_model("openai", "gpt-4o")
        parts: List[str] = []
        async for event in chat.stream_message(
            UserMessage(
                text="Analyse this screenshot for phishing / brand impersonation clues. Return only JSON.",
                file_contents=[ImageContent(image_b64)],
            )
        ):
            if isinstance(event, TextDelta):
                parts.append(event.content)
        raw = "".join(parts).strip()
        # Strip potential markdown fences
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
        import json
        try:
            data = json.loads(raw)
        except Exception:
            data = {**fallback, "ocr_text": raw[:600], "explanation": "Model returned prose instead of JSON."}
        data.setdefault("ocr_text", "")
        data.setdefault("detected_brands", [])
        data.setdefault("suspicious_elements", [])
        data.setdefault("clone_confidence", 0)
        data.setdefault("verdict", "Uncertain")
        data.setdefault("explanation", "")
        return data
    except Exception as exc:
        logger.warning("Vision analysis unavailable: %s", exc)
        return fallback


async def stt_transcribe(audio_bytes: bytes, audio_format: str, language: Optional[str]) -> Dict[str, Any]:
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return {"text": "", "language": language or "en", "error": "Voice service unavailable."}
    tmp_path = None
    try:
        # Whisper accepts m4a / mp3 / wav / webm etc.
        suffix = "." + (audio_format or "webm").lstrip(".")
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        stt = OpenAISpeechToText(api_key=key)
        response = await stt.transcribe(
            file=tmp_path,
            model="whisper-1",
            response_format="json",
            language=language if language and language != "auto" else None,
        )
        text = getattr(response, "text", None) or (response.get("text") if isinstance(response, dict) else "") or ""
        return {"text": text.strip(), "language": language or "auto"}
    except Exception as exc:
        logger.warning("STT unavailable: %s", exc)
        return {"text": "", "language": language or "en", "error": str(exc)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


async def tts_speak(text: str, language: str, voice: str = "nova") -> Optional[str]:
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key or not text.strip():
        return None
    try:
        tts = OpenAITextToSpeech(api_key=key)
        b64 = await tts.generate_speech_base64(
            text=text[:3800],
            model="tts-1",
            voice=voice if voice in ("alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer") else "nova",
            response_format="mp3",
        )
        return b64
    except Exception as exc:
        logger.warning("TTS unavailable: %s", exc)
        return None


async def assistant_reply(prompt: str, language_code: str) -> str:
    fallback_map = {
        "en": "If a link looks urgent or asks for a password, stop. Verify the source before you click.",
        "hi": "यदि कोई लिंक आपसे तुरंत पासवर्ड मांगे तो रुकें। क्लिक करने से पहले स्रोत की पुष्टि करें।",
        "bn": "কোনো লিঙ্ক যদি তড়িঘড়ি পাসওয়ার্ড চায়, থামুন। ক্লিক করার আগে উৎস যাচাই করুন।",
        "ta": "ஒரு இணைப்பு அவசரமாக கடவுச்சொல்லை கேட்டால் நிறுத்துங்கள். சொடுக்கும் முன் மூலத்தை சரிபார்க்கவும்.",
    }
    key = os.getenv("EMERGENT_LLM_KEY")
    lang_name = LANGUAGE_MAP.get(language_code, "English")
    if not key:
        return fallback_map.get(language_code, fallback_map["en"])
    try:
        chat = LlmChat(
            api_key=key,
            session_id=f"safetap-voice-{uuid.uuid4()}",
            system_message=(
                f"You are SafeTap's safety assistant. Reply ONLY in {lang_name}. "
                "Give short, calm, 3-5 sentence guidance about whether it is safe to visit a link, "
                "what red flags to check (HTTPS, sender, domain, urgency), and what to do if the user has "
                "already clicked. Never claim absolute certainty."
            ),
        ).with_model("openai", "gpt-5.4")
        parts: List[str] = []
        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                parts.append(event.content)
        return "".join(parts).strip() or fallback_map.get(language_code, fallback_map["en"])
    except Exception as exc:
        logger.warning("Assistant reply unavailable: %s", exc)
        return fallback_map.get(language_code, fallback_map["en"])


# ─────────────────────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────────────────────
def _token_from_header(authorization: Optional[str]) -> str:
    return authorization.replace("Bearer ", "", 1).strip() if authorization else ""


def require_role(authorization: Optional[str], expected: str) -> Dict[str, str]:
    token = _token_from_header(authorization)
    session = ACTIVE_TOKENS.get(token)
    if not session or session["role"] != expected:
        raise HTTPException(403, "This workspace is restricted to authorized users")
    return session


def require_any_role(authorization: Optional[str], expected: Tuple[str, ...]) -> Dict[str, str]:
    token = _token_from_header(authorization)
    session = ACTIVE_TOKENS.get(token)
    if not session or session["role"] not in expected:
        raise HTTPException(403, "This workspace is restricted to authorized users")
    return session


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {
        "service": "SafeTap AI",
        "status": "ready",
        "workflow": "Scan → Detect → Verify → Classify → Score → Link → Report",
    }


@api_router.post("/auth/login")
async def login(payload: LoginRequest):
    user = DEMO_USERS.get(payload.email.lower())
    if not user or user["password"] != payload.password or user["role"] != payload.role:
        raise HTTPException(401, "Authentication failed for this role")
    token = f"demo-{uuid.uuid4()}"
    ACTIVE_TOKENS[token] = {"role": user["role"], "email": payload.email.lower()}
    return {
        "token": token,
        "user": {"email": payload.email.lower(), "role": user["role"], "name": user["name"]},
    }


@api_router.post("/scan")
async def scan(payload: ScanRequest, authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    result = analyze_url(payload.url)
    result["ai_explanation"] = await ai_explanation(result)
    case = {
        "id": str(uuid.uuid4()),
        "type": "url",
        "url": result["normalized_url"],
        "domain": result["domain"],
        "risk_score": result["risk_score"],
        "classification": result["classification"],
        "status": "Open",
        "scan_type": payload.scan_type,
        "created_at": now_iso(),
        "factors": result["factors"],
        "threat_feed": result["threat_feed"],
        "brand_lookalike": result.get("brand_lookalike"),
        "ai_explanation": result["ai_explanation"],
        "owner_email": session["email"],
    }
    await db.cases.insert_one(case.copy())
    return {
        **result,
        "case": case,
        "evidence": [
            "URL normalized",
            "Domain heuristics evaluated",
            "Current threat adapter checked",
            "Evidence timeline created",
        ],
    }


@api_router.post("/scan/screenshot")
async def scan_screenshot(payload: ScreenshotScanRequest, authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    # Strip data-URL prefix if present
    b64 = re.sub(r"^data:image/[^;]+;base64,", "", payload.image_base64 or "").strip()
    if not b64:
        raise HTTPException(400, "Image data is required")
    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")
    if len(raw) > 6 * 1024 * 1024:
        raise HTTPException(413, "Screenshot exceeds 6MB limit")

    fp = fingerprint(raw)
    prior = await db.cases.find_one({"image_fingerprint": fp}, {"_id": 0})
    reupload = bool(prior)

    vision = await vision_ocr_and_clone(b64)

    # combine into a risk score (clone confidence + suspicious markers)
    score = min(int(vision.get("clone_confidence") or 0), 100)
    if vision.get("suspicious_elements"):
        score = min(100, score + 8 * len(vision["suspicious_elements"]))
    if reupload:
        score = min(100, score + 15)

    factors: List[Dict[str, Any]] = []
    if vision.get("detected_brands"):
        factors.append({
            "label": "Brand look-alike detected",
            "impact": 20,
            "detail": ", ".join(b.get("name", "?") for b in vision["detected_brands"][:3]),
        })
    for s in (vision.get("suspicious_elements") or [])[:5]:
        factors.append({"label": "Suspicious UI element", "impact": 8, "detail": s})
    if reupload:
        factors.append({
            "label": "Re-uploaded content detected",
            "impact": 15,
            "detail": f"Same image fingerprint appeared in case {prior['id']} on {prior['created_at']}.",
        })

    classification = (
        "brand impersonation" if score >= 60
        else ("suspected impersonation" if score >= 30 else "low risk")
    )

    case = {
        "id": str(uuid.uuid4()),
        "type": "screenshot",
        "filename": payload.filename or f"screenshot-{fp}.png",
        "image_fingerprint": fp,
        "risk_score": score,
        "classification": classification,
        "status": "Open",
        "created_at": now_iso(),
        "factors": factors,
        "ocr_text": vision.get("ocr_text", ""),
        "detected_brands": vision.get("detected_brands", []),
        "suspicious_elements": vision.get("suspicious_elements", []),
        "clone_confidence": vision.get("clone_confidence", 0),
        "reupload_of": prior["id"] if reupload else None,
        "ai_explanation": vision.get("explanation", ""),
        "owner_email": session["email"],
    }
    await db.cases.insert_one(case.copy())
    return {
        "case": case,
        "vision": vision,
        "reupload": reupload,
        "evidence": [
            "Image fingerprint computed",
            "OCR + vision brand match run",
            "Re-upload correlation checked",
            "Case persisted with evidence",
        ],
    }


@api_router.post("/scan/social")
async def scan_social(payload: SocialScanRequest, authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    text = (payload.post_text or "").strip()
    post_url = (payload.post_url or "").strip()
    if not text and not post_url:
        raise HTTPException(400, "Provide a post URL or paste the post text")

    urls = re.findall(r"https?://[^\s)\"']+", f"{post_url} {text}")
    findings: List[Dict[str, Any]] = []
    top_score = 0
    for u in urls[:5]:
        analysed = analyze_url(u)
        findings.append(analysed)
        top_score = max(top_score, analysed["risk_score"])

    factors: List[Dict[str, Any]] = []
    if not urls:
        factors.append({"label": "No links found", "impact": 0, "detail": "Post text scanned; no URLs to follow."})
    lower = f"{post_url} {text}".lower()
    for word, impact, label in (
        ("giveaway", 12, "Giveaway/urgency lure"),
        ("winner", 10, "Winner claim"),
        ("kyc", 14, "Fake KYC bait"),
        ("otp", 16, "Credential/OTP request"),
        ("gift", 8, "Gift-card language"),
        ("prize", 10, "Prize claim"),
    ):
        if word in lower:
            top_score = min(100, top_score + impact)
            factors.append({"label": label, "impact": impact, "detail": f"Post mentions '{word}'."})

    classification = (
        "brand impersonation" if top_score >= 60
        else ("suspected impersonation" if top_score >= 30 else "low risk")
    )
    case = {
        "id": str(uuid.uuid4()),
        "type": "social",
        "post_url": post_url,
        "post_text": text[:1000],
        "platform": payload.platform or "unspecified",
        "urls_found": urls[:10],
        "risk_score": top_score,
        "classification": classification,
        "status": "Open",
        "created_at": now_iso(),
        "factors": factors,
        "findings": findings,
        "owner_email": session["email"],
    }
    await db.cases.insert_one(case.copy())
    return {"case": case, "findings": findings, "evidence": ["Links extracted", "URLs analysed", "Scam language checked"]}


@api_router.get("/reports/mine")
async def reports_mine(authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    query = {"owner_email": session["email"]} if session["role"] == "victim" else {}
    docs = await db.cases.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"count": len(docs), "reports": docs}


@api_router.get("/reports/{case_id}")
async def report_detail(case_id: str, authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    doc = await db.cases.find_one({"id": case_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Report not found")
    if session["role"] == "victim" and doc.get("owner_email") != session["email"]:
        raise HTTPException(403, "You can only download your own reports")
    return {
        "schema": "safetap.evidence.v1",
        "generated_at": now_iso(),
        "case": doc,
        "notes": "Relationships are correlations, not proof of identity.",
    }


@api_router.post("/assistant/transcribe")
async def assistant_transcribe(payload: VoiceTranscribeRequest, authorization: Optional[str] = Header(default=None)):
    require_any_role(authorization, ("victim", "investigator", "admin"))
    b64 = re.sub(r"^data:audio/[^;]+;base64,", "", payload.audio_base64 or "").strip()
    if not b64:
        raise HTTPException(400, "Audio data is required")
    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception:
        raise HTTPException(400, "Invalid base64 audio data")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "Audio exceeds 20MB limit")
    result = await stt_transcribe(raw, payload.audio_format, payload.language)
    return result


@api_router.post("/assistant/reply")
async def assistant_reply_endpoint(payload: VoiceReplyRequest, authorization: Optional[str] = Header(default=None)):
    require_any_role(authorization, ("victim", "investigator", "admin"))
    if payload.language not in LANGUAGE_MAP:
        raise HTTPException(400, f"Unsupported language. Supported: {list(LANGUAGE_MAP.keys())}")
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "Question text is required")
    reply = await assistant_reply(text, payload.language)
    audio_b64 = await tts_speak(reply, payload.language, payload.voice)
    return {
        "language": payload.language,
        "language_name": LANGUAGE_MAP[payload.language],
        "reply_text": reply,
        "audio_base64": audio_b64,
        "audio_available": bool(audio_b64),
    }


@api_router.get("/assistant/languages")
async def assistant_languages():
    return {"languages": [{"code": k, "name": v} for k, v in LANGUAGE_MAP.items()]}


@api_router.get("/graph")
async def graph(authorization: Optional[str] = Header(default=None)):
    session = require_any_role(authorization, ("victim", "investigator", "admin"))
    query = {"owner_email": session["email"]} if session["role"] == "victim" else {}
    docs = await db.cases.find(query, {"_id": 0}).sort("created_at", -1).to_list(60)

    nodes: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, str]] = []

    def add(node_id: str, label: str, kind: str) -> None:
        if not node_id:
            return
        nodes.setdefault(node_id, {"id": node_id, "label": label[:40], "kind": kind})

    for d in docs:
        case_id = d["id"]
        add(case_id, f"case · {d.get('type','case')}", "case")
        if d.get("domain"):
            add(f"dom:{d['domain']}", d["domain"], "domain")
            edges.append({"source": case_id, "target": f"dom:{d['domain']}", "label": "domain"})
        for b in (d.get("detected_brands") or []):
            name = (b.get("name") if isinstance(b, dict) else str(b))
            if name:
                add(f"brand:{name.lower()}", name, "brand")
                edges.append({"source": case_id, "target": f"brand:{name.lower()}", "label": "brand"})
        if d.get("image_fingerprint"):
            add(f"fp:{d['image_fingerprint']}", f"fp {d['image_fingerprint'][:6]}", "fingerprint")
            edges.append({"source": case_id, "target": f"fp:{d['image_fingerprint']}", "label": "fingerprint"})
        for u in (d.get("urls_found") or [])[:3]:
            host = re.sub(r"^https?://", "", u, flags=re.I).split("/")[0][:32]
            if host:
                add(f"dom:{host}", host, "domain")
                edges.append({"source": case_id, "target": f"dom:{host}", "label": "url"})
        if d.get("reupload_of"):
            edges.append({"source": case_id, "target": d["reupload_of"], "label": "reupload_of"})

    return {"nodes": list(nodes.values()), "edges": edges, "case_count": len(docs)}


@api_router.get("/cases")
async def cases(authorization: Optional[str] = Header(default=None)):
    require_any_role(authorization, ("investigator", "admin"))
    return await db.cases.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.get("/investigator/overview")
async def investigator_overview(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, "investigator")
    total = await db.cases.count_documents({})
    high = await db.cases.count_documents({"risk_score": {"$gte": 55}})
    screenshots = await db.cases.count_documents({"type": "screenshot"})
    socials = await db.cases.count_documents({"type": "social"})
    return {
        "metrics": {
            "open_cases": total,
            "high_risk": high,
            "feed_matches": high,
            "brands_monitored": await db.brands.count_documents({}),
            "screenshot_cases": screenshots,
            "social_cases": socials,
        },
        "feed_status": "Adapter ready · fallback available",
    }


@api_router.get("/admin/overview")
async def admin_overview(authorization: Optional[str] = Header(default=None)):
    require_role(authorization, "admin")
    return {
        "users": len(DEMO_USERS),
        "brands": await db.brands.count_documents({}),
        "cases": await db.cases.count_documents({}),
        "campaigns": 0,
        "data_sources": [
            {"name": "Kaggle Phishing URL Features", "type": "historical training", "status": "Configured"},
            {"name": "OpenPhish / PhishTank", "type": "current intelligence", "status": "Adapter ready"},
        ],
        "languages_supported": list(LANGUAGE_MAP.values()),
    }


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
