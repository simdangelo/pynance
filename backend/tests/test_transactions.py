from fastapi.testclient import TestClient

from tests.conftest import create_category, create_transaction


def test_create_transaction(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")

    response = client.post(
        "/api/transactions",
        json={
            "transaction_type": "expense",
            "amount": "12.34",
            "category_id": category["id"],
            "description": "weekly groceries",
            "occurred_on": "2026-08-05",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == "12.34"
    assert data["description"] == "weekly groceries"
    assert data["occurred_on"] == "2026-08-05"
    assert data["id"] > 0


def test_create_transaction_with_unknown_category_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/transactions",
        json={
            "transaction_type": "expense",
            "amount": "5.00",
            "category_id": 9999,
            "description": "phantom",
            "occurred_on": "2026-08-05",
        },
    )

    assert response.status_code == 404


def test_create_transaction_with_mismatched_type_returns_422(client: TestClient) -> None:
    income_category = create_category(client, "salary", "income")

    response = client.post(
        "/api/transactions",
        json={
            "transaction_type": "expense",
            "amount": "5.00",
            "category_id": income_category["id"],
            "description": "should not pass",
            "occurred_on": "2026-08-05",
        },
    )

    assert response.status_code == 422


def test_get_transaction(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.get(f"/api/transactions/{transaction['id']}")

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "pizza"
    assert data["amount"] == "10.00"


def test_get_transaction_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/api/transactions/9999")

    assert response.status_code == 404


def test_list_transactions(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.get("/api/transactions")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_update_transaction_partial(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.patch(
        f"/api/transactions/{transaction['id']}",
        json={"amount": "15.50"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["amount"] == "15.50"
    assert data["description"] == "pizza"


def test_update_transaction_not_found_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/transactions/9999",
        json={"amount": "15.50"},
    )

    assert response.status_code == 404


def test_update_transaction_with_mismatched_type_returns_422(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.patch(
        f"/api/transactions/{transaction['id']}",
        json={"transaction_type": "income"},
    )

    assert response.status_code == 422


def test_delete_transaction(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.delete(f"/api/transactions/{transaction['id']}")

    assert response.status_code == 204
    assert client.get(f"/api/transactions/{transaction['id']}").status_code == 404


def test_delete_transaction_not_found_returns_404(client: TestClient) -> None:
    response = client.delete("/api/transactions/9999")

    assert response.status_code == 404
