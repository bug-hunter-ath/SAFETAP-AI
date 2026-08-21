"""Iteration 6 tests for SafeTap AI new features:
- Screenshot scan, social scan, reports (mine/detail), voice assistant, graph, role isolation.
"""
import base64
import os
import struct
import uuid
import zlib

import pytest
import requests


def backend_url():
    env_path = os.path.join(os.path.dirname(__file__), "../../frontend/.env")
    with open(env_path, encoding="utf-8") as env_file:
        values = dict(
            line.strip().split("=", 1)
            for line in env_file
            if "=" in line and not line.startswith("#")
        )
    return values["EXPO_PUBLIC_BACKEND_URL"].strip('"').rstrip("/")


BASE_URL = backend_url()
PASSWORD = "SafeTap123!"


# ─────────────────────────────────────────────────────────────
# Helpers / fixtures
# ─────────────────────────────────────────────────────────────
def _login(session, role):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": f"{role}@safetap.demo", "password": PASSWORD, "role": role},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed for {role}: {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_png_bytes(color=(255, 0, 0, 255)):
    """Build a valid 1x1 PNG deterministically."""
    r, g, b, a = color
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    raw = b"\x00" + bytes([r, g, b, a])
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _make_wav_bytes(seconds=0.2, sample_rate=8000):
    """Build a valid silent WAV."""
    n = int(seconds * sample_rate)
    data = b"\x00\x00" * n
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16)
    header += b"data" + struct.pack("<I", len(data))
    return header + data


@pytest.fixture
def session():
    return requests.Session()


@pytest.fixture
def victim_token(session):
    return _login(session, "victim")


@pytest.fixture
def investigator_token(session):
    return _login(session, "investigator")


@pytest.fixture
def admin_token(session):
    return _login(session, "admin")


# ─────────────────────────────────────────────────────────────
# 1. Auth
# ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize("role", ["victim", "investigator", "admin"])
def test_login_all_roles(session, role):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": f"{role}@safetap.demo", "password": PASSWORD, "role": role},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == role
    assert body["token"].startswith("demo-")


def test_login_wrong_role_rejected(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "victim@safetap.demo", "password": PASSWORD, "role": "admin"},
        timeout=15,
    )
    assert r.status_code == 401


# ─────────────────────────────────────────────────────────────
# 2. URL scan (existing, verify known-phishing hit)
# ─────────────────────────────────────────────────────────────
def test_url_scan_flags_known_phishing(session, victim_token):
    r = session.post(
        f"{BASE_URL}/api/scan",
        json={"url": f"microsoft-login-alert.net/verify?x={uuid.uuid4()}"},
        headers=_auth(victim_token),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["classification"] == "known/reported phishing"
    assert body["threat_feed"]["matched"] is True
    assert body["risk_score"] >= 55
    assert body["factors"] and isinstance(body["factors"], list)
    assert "ai_explanation" in body
    assert body["case"]["domain"] == "microsoft-login-alert.net"


# ─────────────────────────────────────────────────────────────
# 3. Screenshot scan + reupload detection
# ─────────────────────────────────────────────────────────────
def test_screenshot_scan_and_reupload(session, victim_token):
    png_b64 = base64.b64encode(_make_png_bytes((17, 42, 99, 255))).decode()
    r1 = session.post(
        f"{BASE_URL}/api/scan/screenshot",
        json={"image_base64": png_b64, "filename": "test.png"},
        headers=_auth(victim_token),
        timeout=90,
    )
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    case1 = body1["case"]
    for key in ("risk_score", "factors", "ocr_text", "detected_brands", "image_fingerprint", "ai_explanation"):
        assert key in case1, f"missing {key} in screenshot case"
    assert body1["reupload"] is False

    r2 = session.post(
        f"{BASE_URL}/api/scan/screenshot",
        json={"image_base64": png_b64, "filename": "test.png"},
        headers=_auth(victim_token),
        timeout=90,
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["reupload"] is True
    assert body2["case"]["image_fingerprint"] == case1["image_fingerprint"]


def test_screenshot_scan_bad_base64(session, victim_token):
    r = session.post(
        f"{BASE_URL}/api/scan/screenshot",
        json={"image_base64": ""},
        headers=_auth(victim_token),
        timeout=15,
    )
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────
# 4. Social scan
# ─────────────────────────────────────────────────────────────
def test_social_scan_extracts_url_and_flags_scam(session, victim_token):
    payload = {
        "post_text": "URGENT KYC required click https://sbi-secure-update.com/kyc",
        "platform": "WhatsApp",
    }
    r = session.post(
        f"{BASE_URL}/api/scan/social",
        json=payload,
        headers=_auth(victim_token),
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    case = body["case"]
    assert "https://sbi-secure-update.com/kyc" in case["urls_found"]
    assert case["platform"] == "WhatsApp"
    assert case["risk_score"] >= 55
    labels = [f["label"].lower() for f in case["factors"]]
    assert any("kyc" in l for l in labels)


def test_social_scan_requires_input(session, victim_token):
    r = session.post(
        f"{BASE_URL}/api/scan/social",
        json={},
        headers=_auth(victim_token),
        timeout=15,
    )
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────
# 5 & 6. Reports (mine + detail)
# ─────────────────────────────────────────────────────────────
def test_reports_mine_victim_scoped(session, victim_token, investigator_token):
    # ensure at least one case for victim
    session.post(
        f"{BASE_URL}/api/scan",
        json={"url": f"account-verify-now.info/{uuid.uuid4()}"},
        headers=_auth(victim_token),
        timeout=30,
    )
    r = session.get(f"{BASE_URL}/api/reports/mine", headers=_auth(victim_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    for report in body["reports"]:
        assert report.get("owner_email") == "victim@safetap.demo"

    # investigator sees all
    r_inv = session.get(f"{BASE_URL}/api/reports/mine", headers=_auth(investigator_token), timeout=15)
    assert r_inv.status_code == 200
    assert r_inv.json()["count"] >= body["count"]


def test_report_detail_victim_403_for_others(session, victim_token, investigator_token):
    # investigator creates a case
    scan = session.post(
        f"{BASE_URL}/api/scan",
        json={"url": f"hdfc-verify-account.net/{uuid.uuid4()}"},
        headers=_auth(investigator_token),
        timeout=30,
    ).json()
    other_case_id = scan["case"]["id"]

    # victim cannot fetch investigator-owned case
    r = session.get(
        f"{BASE_URL}/api/reports/{other_case_id}",
        headers=_auth(victim_token),
        timeout=15,
    )
    assert r.status_code == 403

    # investigator can
    r_inv = session.get(
        f"{BASE_URL}/api/reports/{other_case_id}",
        headers=_auth(investigator_token),
        timeout=15,
    )
    assert r_inv.status_code == 200
    assert r_inv.json()["case"]["id"] == other_case_id


def test_report_detail_not_found(session, investigator_token):
    r = session.get(
        f"{BASE_URL}/api/reports/does-not-exist-{uuid.uuid4()}",
        headers=_auth(investigator_token),
        timeout=15,
    )
    assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# 7-9. Voice assistant
# ─────────────────────────────────────────────────────────────
def test_assistant_languages_list(session, victim_token):
    r = session.get(f"{BASE_URL}/api/assistant/languages", headers=_auth(victim_token), timeout=15)
    assert r.status_code == 200
    langs = r.json()["languages"]
    codes = {l["code"] for l in langs}
    assert codes == {"en", "hi", "bn", "ta", "te", "mr", "kn", "ml", "gu", "pa"}
    assert len(langs) == 10


def test_assistant_transcribe_wav(session, victim_token):
    wav_b64 = base64.b64encode(_make_wav_bytes()).decode()
    r = session.post(
        f"{BASE_URL}/api/assistant/transcribe",
        json={"audio_base64": wav_b64, "audio_format": "wav", "language": "en"},
        headers=_auth(victim_token),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "text" in body
    assert "language" in body


def test_assistant_transcribe_bad_audio(session, victim_token):
    r = session.post(
        f"{BASE_URL}/api/assistant/transcribe",
        json={"audio_base64": ""},
        headers=_auth(victim_token),
        timeout=15,
    )
    assert r.status_code == 400


@pytest.mark.parametrize("lang", ["en", "hi"])
def test_assistant_reply_language(session, victim_token, lang):
    r = session.post(
        f"{BASE_URL}/api/assistant/reply",
        json={"text": "Is https://microsoft-login-alert.net/verify safe?", "language": lang},
        headers=_auth(victim_token),
        timeout=90,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["language"] == lang
    assert body["reply_text"].strip() != ""
    # audio may be None if TTS unavailable; but flag should reflect reality
    assert body["audio_available"] == bool(body["audio_base64"])


def test_assistant_reply_unsupported_language(session, victim_token):
    r = session.post(
        f"{BASE_URL}/api/assistant/reply",
        json={"text": "hello", "language": "zz"},
        headers=_auth(victim_token),
        timeout=15,
    )
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────
# 10. Graph
# ─────────────────────────────────────────────────────────────
def test_graph_victim_scoped(session, victim_token, admin_token):
    # trigger a scan for victim so graph has data
    session.post(
        f"{BASE_URL}/api/scan",
        json={"url": f"secure-paypal-check.com/{uuid.uuid4()}"},
        headers=_auth(victim_token),
        timeout=30,
    )
    v = session.get(f"{BASE_URL}/api/graph", headers=_auth(victim_token), timeout=15)
    assert v.status_code == 200
    body_v = v.json()
    assert set(body_v.keys()) >= {"nodes", "edges", "case_count"}
    assert body_v["case_count"] >= 1

    a = session.get(f"{BASE_URL}/api/graph", headers=_auth(admin_token), timeout=15)
    assert a.status_code == 200
    assert a.json()["case_count"] >= body_v["case_count"]


# ─────────────────────────────────────────────────────────────
# 11. Role restrictions on privileged endpoints
# ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize("path", ["/api/cases", "/api/investigator/overview", "/api/admin/overview"])
def test_victim_cannot_access_privileged(session, victim_token, path):
    r = session.get(f"{BASE_URL}{path}", headers=_auth(victim_token), timeout=15)
    assert r.status_code == 403


# ─────────────────────────────────────────────────────────────
# 12 & 13. Overview contracts
# ─────────────────────────────────────────────────────────────
def test_investigator_overview_new_fields(session, investigator_token):
    r = session.get(
        f"{BASE_URL}/api/investigator/overview",
        headers=_auth(investigator_token),
        timeout=15,
    )
    assert r.status_code == 200
    metrics = r.json()["metrics"]
    assert "screenshot_cases" in metrics
    assert "social_cases" in metrics
    assert isinstance(metrics["screenshot_cases"], int)
    assert isinstance(metrics["social_cases"], int)


def test_admin_overview_languages(session, admin_token):
    r = session.get(
        f"{BASE_URL}/api/admin/overview",
        headers=_auth(admin_token),
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    langs = body.get("languages_supported")
    assert isinstance(langs, list)
    assert len(langs) == 10
    assert "English" in langs and "Hindi" in langs
