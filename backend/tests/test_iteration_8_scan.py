"""Iteration 8: URL risk scoring tightening + regression."""
import os
import base64
import pytest
import requests


def _base_url() -> str:
    env_path = os.path.join(os.path.dirname(__file__), "../../frontend/.env")
    with open(env_path, encoding="utf-8") as fh:
        vals = dict(l.strip().split("=", 1) for l in fh if "=" in l and not l.startswith("#"))
    return vals["EXPO_PUBLIC_BACKEND_URL"].strip('"').rstrip("/")


BASE = _base_url()


def _login(role: str) -> str:
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": f"{role}@safetap.demo", "password": "SafeTap123!", "role": role},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return tok


@pytest.fixture(scope="module")
def victim_token():
    return _login("victim")


def _scan(token: str, url: str) -> dict:
    r = requests.post(
        f"{BASE}/api/scan",
        json={"url": url},
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── URL risk scoring cases ────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "url,min_score,expected_class,must_have_factor",
    [
        ("paypa1-verify-account.com", 50, "likely phishing", "Brand look-alike (paypal)"),
        ("amaz0n-login.tk", 55, "likely phishing", "Brand look-alike (amazon)"),
        ("192.168.1.4/login", 55, "likely phishing", "IP address instead of domain"),
        ("https://microsoftt-secure.xyz/update", 60, "likely phishing", "Suspicious TLD"),
        ("microsoft-login-alert.net/verify", 90, "known/reported phishing", None),
    ],
)
def test_high_risk_url(victim_token, url, min_score, expected_class, must_have_factor):
    body = _scan(victim_token, url)
    labels = [f["label"] for f in body.get("factors", [])]
    assert body["risk_score"] >= min_score, (
        f"URL={url} score={body['risk_score']} labels={labels}"
    )
    assert body["classification"] == expected_class, (
        f"URL={url} classification={body['classification']} labels={labels}"
    )
    if must_have_factor:
        assert must_have_factor in labels, f"expected {must_have_factor} in {labels}"


@pytest.mark.parametrize(
    "url,max_score",
    [
        ("https://google.com", 15),
        ("https://paypal.com/login", 25),
    ],
)
def test_low_risk_url(victim_token, url, max_score):
    body = _scan(victim_token, url)
    assert body["risk_score"] <= max_score, (
        f"URL={url} score={body['risk_score']} factors={[f['label'] for f in body['factors']]}"
    )
    assert body["classification"] == "low risk", body["classification"]


# ── Regression: previously green endpoints ────────────────────────────────────
@pytest.mark.parametrize("role", ["victim", "investigator", "admin"])
def test_login_all_roles(role):
    tok = _login(role)
    assert tok.startswith("demo-") or tok


def _tiny_png_b64() -> str:
    raw = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABXvMqOgAAAABJRU5ErkJggg=="
    )
    return "data:image/png;base64," + base64.b64encode(raw).decode()


def test_scan_screenshot(victim_token):
    r = requests.post(
        f"{BASE}/api/scan/screenshot",
        json={"filename": "test.png", "image_base64": _tiny_png_b64()},
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "case" in body and body["case"]["id"]


def test_scan_social(victim_token):
    r = requests.post(
        f"{BASE}/api/scan/social",
        json={"platform": "whatsapp", "post_text": "URGENT KYC verify at https://sbi-secure-update.com/kyc"},
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json()["case"]["risk_score"] >= 30


def test_reports_mine(victim_token):
    r = requests.get(
        f"{BASE}/api/reports/mine",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body.get("reports"), list) and len(body["reports"]) >= 1


def test_report_detail(victim_token):
    listing = requests.get(
        f"{BASE}/api/reports/mine",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    ).json()
    cid = listing["reports"][0]["id"]
    r = requests.get(
        f"{BASE}/api/reports/{cid}",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["case"]["id"] == cid
    assert "factors" in body["case"]


def test_graph(victim_token):
    r = requests.get(
        f"{BASE}/api/graph",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body and "edges" in body


def test_assistant_languages(victim_token):
    r = requests.get(
        f"{BASE}/api/assistant/languages",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_victim_forbidden_cases(victim_token):
    r = requests.get(
        f"{BASE}/api/cases",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403


def test_victim_forbidden_investigator(victim_token):
    r = requests.get(
        f"{BASE}/api/investigator/overview",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403


def test_victim_forbidden_admin(victim_token):
    r = requests.get(
        f"{BASE}/api/admin/overview",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403
