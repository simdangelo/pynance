import pytest
from fastapi.testclient import TestClient

from pynance.config import settings
from tests.conftest import create_category, create_transaction, create_user, login


def test_config_reports_demo_data_flag(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "enable_demo_data", True)
    assert client.get("/api/config").json() == {"demo_data_enabled": True}

    monkeypatch.setattr(settings, "enable_demo_data", False)
    assert client.get("/api/config").json() == {"demo_data_enabled": False}


def test_demo_data_disabled_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "enable_demo_data", False)

    assert client.post("/api/demo-data").status_code == 404


def test_demo_data_generates_and_replaces(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "enable_demo_data", True)

    first = client.post("/api/demo-data")
    assert first.status_code == 200, first.text
    created = first.json()["transactions_created"]
    assert created > 100
    assert len(client.get("/api/transactions").json()) == created
    assert len(client.get("/api/adjustments").json()) > 0
    assert len(client.get("/api/recurring-template").json()) >= 3

    # Pressing again replaces the data instead of duplicating it.
    second = client.post("/api/demo-data")
    second_created = second.json()["transactions_created"]
    assert second_created > 100
    assert len(client.get("/api/transactions").json()) == second_created

    me = client.get("/api/auth/me").json()
    assert me["default_asset_id"] is not None


def test_demo_data_does_not_touch_other_users(
    anon_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "enable_demo_data", True)

    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    groceries = create_category(anon_client, "Custom", "expense")
    create_transaction(
        anon_client,
        amount="5.00",
        category_id=groceries["id"],
        description="keep me",
        occurred_on="2026-03-01",
    )

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")
    assert anon_client.post("/api/demo-data").status_code == 200

    login(anon_client, "alice@example.com")
    transactions = anon_client.get("/api/transactions?year=2026&month=3").json()
    assert [transaction["description"] for transaction in transactions] == ["keep me"]
