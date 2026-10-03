from typing import Any, cast

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import (
    create_asset,
    create_category,
    create_recurring_template,
    create_user,
    login,
)


def test_me_has_no_default_asset_initially(client: TestClient) -> None:
    me = client.get("/api/auth/me").json()

    assert me["default_asset_id"] is None


def test_set_default_asset(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")

    response = client.patch("/api/auth/me", json={"default_asset_id": asset["id"]})

    assert response.status_code == 200
    assert response.json()["default_asset_id"] == asset["id"]
    assert client.get("/api/auth/me").json()["default_asset_id"] == asset["id"]


def test_set_unknown_default_asset_returns_404(client: TestClient) -> None:
    response = client.patch("/api/auth/me", json={"default_asset_id": 9999})

    assert response.status_code == 404


def test_set_non_liquid_default_asset_returns_422(client: TestClient) -> None:
    buckets = client.get("/api/buckets").json()
    reserve = next(bucket for bucket in buckets if bucket["liquidity_category"] == "reserve")
    asset = create_asset(
        client,
        name="Deposit",
        asset_class="deposit_account",
        bucket_id=reserve["id"],
    )

    response = client.patch("/api/auth/me", json={"default_asset_id": asset["id"]})

    assert response.status_code == 422


def test_set_default_asset_of_another_user_returns_404(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    alice_asset = create_asset(anon_client, name="Alice checking", asset_class="current_account")

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")

    response = anon_client.patch("/api/auth/me", json={"default_asset_id": alice_asset["id"]})

    assert response.status_code == 404


def test_clear_default_asset(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    client.patch("/api/auth/me", json={"default_asset_id": asset["id"]})

    response = client.patch("/api/auth/me", json={"default_asset_id": None})

    assert response.status_code == 200
    assert response.json()["default_asset_id"] is None


def test_recurring_generation_uses_the_default_asset(client: TestClient) -> None:
    first = create_asset(client, name="Checking", asset_class="current_account")
    second = create_asset(client, name="Revolut", asset_class="current_account")
    groceries = create_category(client, "Spesa", "expense")
    client.patch("/api/auth/me", json={"default_asset_id": second["id"]})
    template = create_recurring_template(
        client,
        description="Affitto",
        amount="780.00",
        category_id=groceries["id"],
        frequency="monthly",
        next_occurrence="2026-01-01",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 201, response.text
    transaction = cast("dict[str, Any]", response.json())
    assert transaction["asset_id"] == second["id"]
    assert transaction["asset_id"] != first["id"]


def test_deleting_the_default_asset_clears_the_preference(
    client: TestClient, db_session: Session
) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    client.patch("/api/auth/me", json={"default_asset_id": asset["id"]})

    assert client.delete(f"/api/assets/{asset['id']}").status_code == 204

    db_session.expire_all()
    assert client.get("/api/auth/me").json()["default_asset_id"] is None
