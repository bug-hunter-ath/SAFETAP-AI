import os
import uuid

import pytest
import requests


def backend_url():
    env_path = os.path.join(os.path.dirname(__file__), "../../frontend/.env")
    with open(env_path, encoding="utf-8") as env_file:
        values = dict(line.strip().split("=", 1) for line in env_file if "=" in line and not line.startswith("#"))
    return values["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


BASE_URL = backend_url()


@pytest.fixture
def client():
    return requests.Session()


def test_readiness(client):
    response = client.get(f"{BASE_URL}/api/", timeout=15)
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


@pytest.mark.parametrize("role", ["victim", "investigator", "admin"])
def test_demo_login_all_roles(client, role):
    response = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": f"{role}@safetap.demo", "password": "SafeTap123!", "role": role},
        timeout=15,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == role
    assert body["token"].startswith("demo-")


def test_invalid_credentials_rejected(client):
    response = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "victim@safetap.demo", "password": "wrong", "role": "victim"},
        timeout=15,
    )
    assert response.status_code == 401
    assert "Authentication failed" in response.json()["detail"]


def test_scan_creates_case_and_returns_explainable_result(client):
    url = f"secure-paypal-check.com/{uuid.uuid4()}"
    login = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "victim@safetap.demo", "password": "SafeTap123!", "role": "victim"},
        timeout=15,
    )
    assert login.status_code == 200
    response = client.post(
        f"{BASE_URL}/api/scan",
        json={"url": url},
        headers={"Authorization": f"Bearer {login.json()['token']}"},
        timeout=20,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["risk_score"] >= 55
    assert body["classification"] == "known/reported phishing"
    assert body["threat_feed"]["matched"] is True
    assert body["factors"]
    assert body["case"]["domain"] == "secure-paypal-check.com"


def test_overviews_return_expected_contract(client):
    assert client.get(f"{BASE_URL}/api/investigator/overview", timeout=15).status_code == 403
    assert client.get(f"{BASE_URL}/api/admin/overview", timeout=15).status_code == 403
    investigator_login = client.post(f"{BASE_URL}/api/auth/login", json={"email": "investigator@safetap.demo", "password": "SafeTap123!", "role": "investigator"}, timeout=15).json()
    admin_login = client.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@safetap.demo", "password": "SafeTap123!", "role": "admin"}, timeout=15).json()
    investigator = client.get(f"{BASE_URL}/api/investigator/overview", headers={"Authorization": f"Bearer {investigator_login['token']}"}, timeout=15)
    admin = client.get(f"{BASE_URL}/api/admin/overview", headers={"Authorization": f"Bearer {admin_login['token']}"}, timeout=15)
    assert investigator.status_code == 200
    assert set(investigator.json()["metrics"]) >= {"open_cases", "high_risk", "feed_matches"}
    assert admin.status_code == 200
    assert any("OpenPhish" in source["name"] for source in admin.json()["data_sources"])


def test_cases_requires_privileged_role(client):
    assert client.get(f"{BASE_URL}/api/cases", timeout=15).status_code == 403
    victim = client.post(f"{BASE_URL}/api/auth/login", json={"email": "victim@safetap.demo", "password": "SafeTap123!", "role": "victim"}, timeout=15).json()
    assert client.get(f"{BASE_URL}/api/cases", headers={"Authorization": f"Bearer {victim['token']}"}, timeout=15).status_code == 403
    investigator = client.post(f"{BASE_URL}/api/auth/login", json={"email": "investigator@safetap.demo", "password": "SafeTap123!", "role": "investigator"}, timeout=15).json()
    response = client.get(f"{BASE_URL}/api/cases", headers={"Authorization": f"Bearer {investigator['token']}"}, timeout=15)
    assert response.status_code == 200
    assert isinstance(response.json(), list)