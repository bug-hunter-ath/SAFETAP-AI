"""Iteration 7 regression: backend endpoints must still be green after frontend PDF/graph/tab fixes."""
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


def _login(session: requests.Session, role: str) -> str:
    r = session.post(
        f"{BASE}/api/auth/login",
        json={"email": f"{role}@safetap.demo", "password": "SafeTap123!", "role": role},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    assert tok
    return tok


@pytest.fixture(scope="module")
def victim_token():
    return _login(requests.Session(), "victim")


@pytest.fixture(scope="module")
def investigator_token():
    return _login(requests.Session(), "investigator")


@pytest.fixture(scope="module")
def admin_token():
    return _login(requests.Session(), "admin")


# ── Auth ──────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("role", ["victim", "investigator", "admin"])
def test_login_all_roles(role):
    tok = _login(requests.Session(), role)
    assert tok.startswith("demo-")


# ── Scan endpoints ────────────────────────────────────────────────────────────
def test_scan_url(victim_token):
    r = requests.post(
        f"{BASE}/api/scan",
        json={"url": "microsoft-login-alert.net/verify"},
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["risk_score"] >= 55
    assert body["classification"]
    assert body["case"]["id"]


def _tiny_png_b64() -> str:
    # 1x1 transparent PNG
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
    assert "risk_score" in body["case"]


def test_scan_social(victim_token):
    r = requests.post(
        f"{BASE}/api/scan/social",
        json={"platform": "whatsapp", "post_text": "URGENT KYC verify at https://sbi-secure-update.com/kyc"},
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["case"]["risk_score"] >= 30
    assert body["case"]["id"]


# ── Reports ───────────────────────────────────────────────────────────────────
def test_reports_mine_victim(victim_token):
    r = requests.get(
        f"{BASE}/api/reports/mine",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "reports" in body
    assert isinstance(body["reports"], list)
    assert len(body["reports"]) >= 1


def test_report_detail_returns_evidence(victim_token):
    listing = requests.get(
        f"{BASE}/api/reports/mine",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    ).json()
    assert listing["reports"], "expected at least one case"
    cid = listing["reports"][0]["id"]
    r = requests.get(
        f"{BASE}/api/reports/{cid}",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("schema", "").startswith("safetap.evidence")
    assert body["case"]["id"] == cid
    assert "risk_score" in body["case"]
    assert "classification" in body["case"]
    assert "factors" in body["case"]


# ── Graph ─────────────────────────────────────────────────────────────────────
def test_graph_endpoint(victim_token):
    r = requests.get(
        f"{BASE}/api/graph",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "nodes" in body and "edges" in body and "case_count" in body
    assert isinstance(body["nodes"], list)
    assert isinstance(body["edges"], list)
    assert body["case_count"] >= 1
    # Should have at least a case node
    kinds = {n["kind"] for n in body["nodes"]}
    assert "case" in kinds


# ── Role restrictions ─────────────────────────────────────────────────────────
def test_victim_forbidden_from_cases(victim_token):
    r = requests.get(
        f"{BASE}/api/cases",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403


def test_victim_forbidden_from_investigator_overview(victim_token):
    r = requests.get(
        f"{BASE}/api/investigator/overview",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403


def test_victim_forbidden_from_admin_overview(victim_token):
    r = requests.get(
        f"{BASE}/api/admin/overview",
        headers={"Authorization": f"Bearer {victim_token}"},
        timeout=15,
    )
    assert r.status_code == 403
