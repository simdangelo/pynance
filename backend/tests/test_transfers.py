from fastapi.testclient import TestClient

from tests.conftest import create_asset, create_transfer


def test_create_transfer(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")

    response = client.post(
        "/api/transfers",
        json={
            "source_asset_id": checking["id"],
            "destination_asset_id": savings["id"],
            "amount": "100.00",
            "description": "move to savings",
            "occurred_on": "2026-08-01",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["source_asset_id"] == checking["id"]
    assert data["destination_asset_id"] == savings["id"]
    assert data["amount"] == "100.00"
    assert data["id"] > 0


def test_create_transfer_unknown_source_returns_404(client: TestClient) -> None:
    savings = create_asset(client, name="Savings", asset_type="savings")

    response = client.post(
        "/api/transfers",
        json={
            "source_asset_id": 9999,
            "destination_asset_id": savings["id"],
            "amount": "100.00",
            "description": "move",
            "occurred_on": "2026-08-01",
        },
    )

    assert response.status_code == 404


def test_create_transfer_unknown_destination_returns_404(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")

    response = client.post(
        "/api/transfers",
        json={
            "source_asset_id": checking["id"],
            "destination_asset_id": 9999,
            "amount": "100.00",
            "description": "move",
            "occurred_on": "2026-08-01",
        },
    )

    assert response.status_code == 404


def test_create_transfer_self_transfer_returns_422(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")

    response = client.post(
        "/api/transfers",
        json={
            "source_asset_id": checking["id"],
            "destination_asset_id": checking["id"],
            "amount": "100.00",
            "description": "self move",
            "occurred_on": "2026-08-01",
        },
    )

    assert response.status_code == 422


def test_list_transfers(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )
    create_transfer(
        client,
        source_asset_id=savings["id"],
        destination_asset_id=checking["id"],
        amount="20.00",
        description="cash back",
        occurred_on="2026-08-05",
    )

    response = client.get("/api/transfers")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_transfer(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    transfer = create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.get(f"/api/transfers/{transfer['id']}")

    assert response.status_code == 200
    assert response.json()["amount"] == "100.00"


def test_get_transfer_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/api/transfers/9999")

    assert response.status_code == 404


def test_update_transfer_amount_partial(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    transfer = create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.patch(f"/api/transfers/{transfer['id']}", json={"amount": "150.00"})

    assert response.status_code == 200
    assert response.json()["amount"] == "150.00"


def test_update_transfer_changes_asset(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    etf = create_asset(client, name="ETF", asset_type="etf")
    transfer = create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.patch(
        f"/api/transfers/{transfer['id']}", json={"destination_asset_id": etf["id"]}
    )

    assert response.status_code == 200
    assert response.json()["destination_asset_id"] == etf["id"]


def test_update_transfer_self_transfer_returns_422(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    transfer = create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.patch(
        f"/api/transfers/{transfer['id']}", json={"destination_asset_id": checking["id"]}
    )

    assert response.status_code == 422


def test_update_transfer_not_found_returns_404(client: TestClient) -> None:
    response = client.patch("/api/transfers/9999", json={"amount": "50.00"})

    assert response.status_code == 404


def test_delete_transfer(client: TestClient) -> None:
    checking = create_asset(client, name="Checking", asset_type="liquid")
    savings = create_asset(client, name="Savings", asset_type="savings")
    transfer = create_transfer(
        client,
        source_asset_id=checking["id"],
        destination_asset_id=savings["id"],
        amount="100.00",
        description="savings",
        occurred_on="2026-08-01",
    )

    response = client.delete(f"/api/transfers/{transfer['id']}")

    assert response.status_code == 204
    assert client.get("/api/transfers").json() == []


def test_delete_transfer_not_found_returns_404(client: TestClient) -> None:
    response = client.delete("/api/transfers/9999")

    assert response.status_code == 404
