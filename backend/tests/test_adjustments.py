from typing import Any, cast

from fastapi.testclient import TestClient

from tests.conftest import (
    create_asset,
    create_category,
    create_transaction,
    create_user,
    login,
)


def reconcile(
    client: TestClient,
    rows: list[dict[str, Any]],
    occurred_on: str = "2026-12-31",
    note: str = "Riconciliazione 31/12/2026",
) -> dict[str, Any]:
    response = client.post(
        "/api/adjustments/reconcile",
        json={"occurred_on": occurred_on, "note": note, "rows": rows},
    )
    assert response.status_code == 200, response.text
    return cast("dict[str, Any]", response.json())


def test_reconcile_creates_adjustments_only_for_non_zero_deltas(client: TestClient) -> None:
    checking = create_asset(
        client, name="Checking", asset_class="current_account", opening_balance="100.00"
    )
    savings = create_asset(
        client, name="Savings", asset_class="deposit_account", opening_balance="50.00"
    )

    result = reconcile(
        client,
        [
            {"asset_id": checking["id"], "declared_balance": "120.00"},
            {"asset_id": savings["id"], "declared_balance": "50.00"},
        ],
    )

    assert len(result["adjustments"]) == 1
    adjustment = result["adjustments"][0]
    assert adjustment["asset_id"] == checking["id"]
    assert adjustment["amount"] == "20.00"
    assert adjustment["occurred_on"] == "2026-12-31"
    assert adjustment["note"] == "Riconciliazione 31/12/2026"

    balances = {asset["id"]: asset["balance"] for asset in client.get("/api/assets").json()}
    assert balances[checking["id"]] == "120.00"
    assert balances[savings["id"]] == "50.00"


def test_reconcile_negative_delta_lowers_the_balance(client: TestClient) -> None:
    checking = create_asset(
        client, name="Checking", asset_class="current_account", opening_balance="100.00"
    )

    result = reconcile(client, [{"asset_id": checking["id"], "declared_balance": "70.00"}])

    assert result["adjustments"][0]["amount"] == "-30.00"
    asset = client.get(f"/api/assets/{checking['id']}").json()
    assert asset["balance"] == "70.00"


def test_adjustment_changes_net_worth_and_trend(client: TestClient) -> None:
    groceries = create_category(client, "Spesa", "expense")
    create_asset(client, name="Checking", asset_class="current_account", opening_balance="100.00")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-06-10",
    )
    asset = client.get("/api/assets").json()[0]

    reconcile(client, [{"asset_id": asset["id"], "declared_balance": "110.00"}])

    trend = client.get(
        "/api/assets/net-worth-trend?start_date=2026-06-01&end_date=2026-12-31"
    ).json()
    assert trend[0] == {"year": 2026, "month": 6, "amount": "90.00"}
    assert trend[-1] == {"year": 2026, "month": 12, "amount": "110.00"}


def test_adjustment_does_not_change_category_reports(client: TestClient) -> None:
    groceries = create_category(client, "Spesa", "expense")
    create_asset(client, name="Checking", asset_class="current_account", opening_balance="100.00")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-06-10",
    )
    before = client.get("/api/transactions/summary?year=2026&month=6").json()
    asset = client.get("/api/assets").json()[0]

    reconcile(
        client, [{"asset_id": asset["id"], "declared_balance": "150.00"}], occurred_on="2026-06-30"
    )

    after = client.get("/api/transactions/summary?year=2026&month=6").json()
    assert after == before


def test_list_adjustments_by_asset(client: TestClient) -> None:
    checking = create_asset(
        client, name="Checking", asset_class="current_account", opening_balance="100.00"
    )
    savings = create_asset(
        client, name="Savings", asset_class="deposit_account", opening_balance="50.00"
    )
    reconcile(
        client,
        [
            {"asset_id": checking["id"], "declared_balance": "120.00"},
            {"asset_id": savings["id"], "declared_balance": "40.00"},
        ],
    )

    all_adjustments = client.get("/api/adjustments").json()
    assert len(all_adjustments) == 2

    checking_only = client.get(f"/api/adjustments?asset_id={checking['id']}").json()
    assert len(checking_only) == 1
    assert checking_only[0]["asset_id"] == checking["id"]


def test_delete_adjustment_removes_its_effect(client: TestClient) -> None:
    checking = create_asset(
        client, name="Checking", asset_class="current_account", opening_balance="100.00"
    )
    result = reconcile(client, [{"asset_id": checking["id"], "declared_balance": "120.00"}])
    adjustment_id = result["adjustments"][0]["id"]

    response = client.delete(f"/api/adjustments/{adjustment_id}")

    assert response.status_code == 204
    asset = client.get(f"/api/assets/{checking['id']}").json()
    assert asset["balance"] == "100.00"
    assert client.get("/api/adjustments").json() == []


def test_reconcile_unknown_asset_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/adjustments/reconcile",
        json={
            "occurred_on": "2026-12-31",
            "note": None,
            "rows": [{"asset_id": 9999, "declared_balance": "10.00"}],
        },
    )

    assert response.status_code == 404


def test_reconcile_with_another_users_asset_returns_404(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    alice_asset = create_asset(
        anon_client, name="Alice checking", asset_class="current_account", opening_balance="100.00"
    )

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")

    response = anon_client.post(
        "/api/adjustments/reconcile",
        json={
            "occurred_on": "2026-12-31",
            "note": None,
            "rows": [{"asset_id": alice_asset["id"], "declared_balance": "10.00"}],
        },
    )

    assert response.status_code == 404


def test_delete_another_users_adjustment_returns_404(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    asset = create_asset(
        anon_client, name="Alice checking", asset_class="current_account", opening_balance="100.00"
    )
    adjustment_id = reconcile(
        anon_client, [{"asset_id": asset["id"], "declared_balance": "120.00"}]
    )["adjustments"][0]["id"]

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")

    assert anon_client.delete(f"/api/adjustments/{adjustment_id}").status_code == 404
