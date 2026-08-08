from fastapi.testclient import TestClient


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
