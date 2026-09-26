from fastapi.testclient import TestClient

from tests.conftest import (
    create_asset,
    create_category,
    create_transaction,
    create_transfer,
)


def _liquidity_totals(client: TestClient) -> dict[str, str]:
    data = client.get("/api/assets/allocation").json()
    return {row["liquidity_category"]: row["total"] for row in data["by_liquidity"]}


def _bucket_totals(client: TestClient) -> dict[str, str]:
    data = client.get("/api/assets/allocation").json()
    return {row["bucket_name"]: row["total"] for row in data["by_bucket"]}


def test_allocation_groups_balances_by_liquidity(client: TestClient) -> None:
    buckets = {bucket["name"]: bucket for bucket in client.get("/api/buckets").json()}
    create_asset(
        client,
        name="Checking",
        asset_class="current_account",
        bucket_id=buckets["Liquidità quotidiana"]["id"],
        opening_balance="100.00",
    )
    create_asset(
        client,
        name="Deposit",
        asset_class="deposit_account",
        bucket_id=buckets["Fondo di emergenza"]["id"],
        opening_balance="200.00",
    )
    create_asset(
        client,
        name="ETF",
        asset_class="equity_etf",
        bucket_id=buckets["Investimenti"]["id"],
        opening_balance="300.00",
    )

    totals = _liquidity_totals(client)

    assert totals == {"liquid": "100.00", "reserve": "200.00", "invested": "300.00"}


def test_allocation_always_returns_three_liquidity_categories_and_all_buckets(
    client: TestClient,
) -> None:
    data = client.get("/api/assets/allocation").json()

    assert [row["liquidity_category"] for row in data["by_liquidity"]] == [
        "liquid",
        "reserve",
        "invested",
    ]
    assert all(row["total"] == "0.00" for row in data["by_liquidity"])
    assert [row["bucket_name"] for row in data["by_bucket"]] == [
        "Liquidità quotidiana",
        "Fondo di emergenza",
        "Investimenti",
    ]
    assert all(row["total"] == "0.00" for row in data["by_bucket"])


def test_allocation_reflects_transactions_and_transfers(client: TestClient) -> None:
    buckets = {bucket["name"]: bucket for bucket in client.get("/api/buckets").json()}
    groceries = create_category(client, "groceries", "expense")
    checking = create_asset(
        client,
        name="Checking",
        asset_class="current_account",
        bucket_id=buckets["Liquidità quotidiana"]["id"],
        opening_balance="100.00",
    )
    deposit = create_asset(
        client,
        name="Deposit",
        asset_class="deposit_account",
        bucket_id=buckets["Fondo di emergenza"]["id"],
    )
    create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=deposit["id"],
        amount="40.00",
        description="savings",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-02",
        asset_id=checking["id"],
    )

    assert _liquidity_totals(client) == {
        "liquid": "50.00",
        "reserve": "40.00",
        "invested": "0.00",
    }
    by_bucket = _bucket_totals(client)
    assert by_bucket["Liquidità quotidiana"] == "50.00"
    assert by_bucket["Fondo di emergenza"] == "40.00"


def test_allocation_follows_asset_bucket_reassignment(client: TestClient) -> None:
    buckets = client.get("/api/buckets").json()
    etf = create_asset(
        client,
        name="ETF",
        asset_class="equity_etf",
        bucket_id=buckets[2]["id"],
        opening_balance="300.00",
    )
    assert _liquidity_totals(client)["invested"] == "300.00"

    response = client.patch(f"/api/assets/{etf['id']}", json={"bucket_id": buckets[0]["id"]})

    assert response.status_code == 200
    assert response.json()["liquidity_category"] == "liquid"
    totals = _liquidity_totals(client)
    assert totals["liquid"] == "300.00"
    assert totals["invested"] == "0.00"
