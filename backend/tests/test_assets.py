from decimal import Decimal

from fastapi.testclient import TestClient

from tests.conftest import create_asset, create_category, create_transaction, create_transfer


def test_create_asset(client: TestClient) -> None:
    response = client.post(
        "/api/assets",
        json={"name": "Checking", "asset_type": "liquid", "opening_balance": "100.00"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Checking"
    assert data["asset_type"] == "liquid"
    assert data["opening_balance"] == "100.00"
    assert data["balance"] == "100.00"
    assert data["id"] > 0


def test_create_asset_without_opening_balance_defaults_to_zero(client: TestClient) -> None:
    response = client.post(
        "/api/assets",
        json={"name": "Checking", "asset_type": "liquid"},
    )

    assert response.status_code == 422


def test_create_asset_duplicate_name_returns_409(client: TestClient) -> None:
    create_asset(client, name="Checking", asset_type="liquid")

    response = client.post(
        "/api/assets",
        json={"name": "Checking", "asset_type": "savings", "opening_balance": "0"},
    )

    assert response.status_code == 409


def test_list_assets(client: TestClient) -> None:
    create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")
    create_asset(client, name="Savings", asset_type="savings", opening_balance="50.00")

    response = client.get("/api/assets")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    by_name = {asset["name"]: asset for asset in data}
    assert by_name["Checking"]["balance"] == "100.00"
    assert by_name["Savings"]["balance"] == "50.00"


def test_get_asset(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")

    response = client.get(f"/api/assets/{asset['id']}")

    assert response.status_code == 200
    assert response.json()["name"] == "Checking"


def test_get_asset_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/api/assets/9999")

    assert response.status_code == 404


def test_update_asset(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")

    response = client.patch(
        f"/api/assets/{asset['id']}",
        json={"name": "Main checking", "opening_balance": "200.00"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Main checking"
    assert data["opening_balance"] == "200.00"
    assert data["balance"] == "200.00"


def test_update_asset_duplicate_name_returns_409(client: TestClient) -> None:
    create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")

    response = client.patch(
        f"/api/assets/{savings['id']}",
        json={"name": "Checking"},
    )

    assert response.status_code == 409


def test_update_asset_not_found_returns_404(client: TestClient) -> None:
    response = client.patch("/api/assets/9999", json={"name": "Renamed"})

    assert response.status_code == 404


def test_delete_asset(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_type="liquid")

    response = client.delete(f"/api/assets/{asset['id']}")

    assert response.status_code == 204
    assert client.get("/api/assets").json() == []


def test_delete_asset_with_transactions_returns_409(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    asset = create_asset(client, name="Checking", asset_type="liquid")
    create_transaction(
        client,
        amount="10.00",
        category_id=category["id"],
        description="food",
        occurred_on="2026-08-01",
        asset_id=asset["id"],
    )

    response = client.delete(f"/api/assets/{asset['id']}")

    assert response.status_code == 409


def test_delete_asset_with_transfers_returns_409(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="10.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.delete(f"/api/assets/{checking['id']}")

    assert response.status_code == 409


def test_balance_includes_opening_balance_and_transactions(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    asset = create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")
    create_transaction(
        client,
        amount="30.00",
        category_id=category["id"],
        description="food",
        occurred_on="2026-08-01",
        asset_id=asset["id"],
    )
    create_transaction(
        client,
        amount="200.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-02",
        asset_id=asset["id"],
    )

    response = client.get(f"/api/assets/{asset['id']}")

    assert response.status_code == 200
    assert response.json()["balance"] == "270.00"


def test_balance_includes_transfers(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")
    savings = create_asset(client, name="Savings", asset_type="savings", opening_balance="0")
    create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="40.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    assets = client.get("/api/assets").json()
    by_name = {asset["name"]: asset for asset in assets}
    assert by_name["Checking"]["balance"] == "60.00"
    assert by_name["Savings"]["balance"] == "40.00"


def test_net_worth_unchanged_by_transfer(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")
    savings = create_asset(client, name="Savings", asset_type="savings", opening_balance="0")

    before = client.get("/api/assets").json()
    before_total = sum(Decimal(asset["balance"]) for asset in before)

    create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="40.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    after = client.get("/api/assets").json()
    after_total = sum(Decimal(asset["balance"]) for asset in after)

    assert before_total == after_total


def test_asset_without_transactions_still_shows_opening_balance(client: TestClient) -> None:
    create_asset(client, name="Checking", asset_type="liquid", opening_balance="100.00")

    assets = client.get("/api/assets").json()

    assert assets[0]["balance"] == "100.00"
