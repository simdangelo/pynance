from fastapi.testclient import TestClient

from tests.conftest import create_transaction


def test_create_category(client: TestClient) -> None:
    response = client.post(
        "/api/categories",
        json={"name": "groceries", "transaction_type": "expense"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "groceries"
    assert data["transaction_type"] == "expense"
    assert data["id"] > 0
    assert "created_at" in data


def test_create_duplicate_category_returns_409(client: TestClient) -> None:
    create_category_payload = {"name": "groceries", "transaction_type": "expense"}
    client.post("/api/categories", json=create_category_payload)

    response = client.post("/api/categories", json=create_category_payload)

    assert response.status_code == 409


def test_create_category_missing_field_returns_422(client: TestClient) -> None:
    response = client.post("/api/categories", json={"name": "groceries"})

    assert response.status_code == 422


def test_list_categories(client: TestClient) -> None:
    create_category_payload = {"name": "groceries", "transaction_type": "expense"}
    client.post("/api/categories", json=create_category_payload)

    response = client.get("/api/categories")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "groceries"


def test_list_categories_empty(client: TestClient) -> None:
    response = client.get("/api/categories")

    assert response.status_code == 200
    assert response.json() == []


def test_delete_category(client: TestClient) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "groceries", "transaction_type": "expense"},
    ).json()

    response = client.delete(f"/api/categories/{category['id']}")

    assert response.status_code == 204
    names = [c["name"] for c in client.get("/api/categories").json()]
    assert "groceries" not in names


def test_delete_category_not_found_returns_404(client: TestClient) -> None:
    response = client.delete("/api/categories/9999")

    assert response.status_code == 404


def test_delete_category_with_transactions_returns_409(client: TestClient) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "groceries", "transaction_type": "expense"},
    ).json()
    create_transaction(
        client,
        amount="10.00",
        category_id=category["id"],
        description="pizza",
        occurred_on="2026-08-05",
    )

    response = client.delete(f"/api/categories/{category['id']}")

    assert response.status_code == 409
    assert client.get("/api/categories").json()[0]["name"] == "groceries"


def test_update_category_name(client: TestClient) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "groceries", "transaction_type": "expense"},
    ).json()

    response = client.patch(
        f"/api/categories/{category['id']}",
        json={"name": "food"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "food"
    assert data["transaction_type"] == "expense"


def test_update_category_type(client: TestClient) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "gifts", "transaction_type": "expense"},
    ).json()

    response = client.patch(
        f"/api/categories/{category['id']}",
        json={"transaction_type": "income"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "gifts"
    assert data["transaction_type"] == "income"


def test_update_category_partial_only_changes_provided_fields(client: TestClient) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "groceries", "transaction_type": "expense"},
    ).json()

    response = client.patch(f"/api/categories/{category['id']}", json={})

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "groceries"
    assert data["transaction_type"] == "expense"


def test_update_category_not_found_returns_404(client: TestClient) -> None:
    response = client.patch("/api/categories/9999", json={"name": "food"})

    assert response.status_code == 404
