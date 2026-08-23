from fastapi.testclient import TestClient

from tests.conftest import create_category, create_transaction


def test_create_transaction(client: TestClient, liquid_asset: int) -> None:
    category = create_category(client, "groceries", "expense")

    response = client.post(
        "/api/transactions",
        json={
            "amount": "12.34",
            "category_id": category["id"],
            "description": "weekly groceries",
            "occurred_on": "2026-08-05",
            "asset_id": liquid_asset,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == "12.34"
    assert data["description"] == "weekly groceries"
    assert data["occurred_on"] == "2026-08-05"
    assert data["transaction_type"] == "expense"
    assert data["id"] > 0


def test_create_transaction_with_unknown_category_returns_404(
    client: TestClient, liquid_asset: int
) -> None:
    response = client.post(
        "/api/transactions",
        json={
            "amount": "5.00",
            "category_id": 9999,
            "description": "phantom",
            "occurred_on": "2026-08-05",
            "asset_id": liquid_asset,
        },
    )

    assert response.status_code == 404


def test_get_transaction(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
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


def test_delete_transaction(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    transaction = create_transaction(
        client,
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


def test_list_transactions_filters_by_year_and_month(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="20.00",
        category_id=groceries["id"],
        description="food july",
        occurred_on="2026-07-15",
    )

    response = client.get("/api/transactions?year=2026&month=8")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["amount"] == "10.00"


def test_list_transactions_filters_by_year_only(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="20.00",
        category_id=groceries["id"],
        description="food 2025",
        occurred_on="2025-08-01",
    )

    response = client.get("/api/transactions?year=2026")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["description"] == "food"


def test_list_transactions_filters_by_category(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    bills = create_category(client, "bills", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="25.00",
        category_id=bills["id"],
        description="electricity",
        occurred_on="2026-08-01",
    )

    response = client.get(f"/api/transactions?category_id={bills['id']}")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["description"] == "electricity"


def test_list_transactions_searches_by_description(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="weekly groceries",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="20.00",
        category_id=groceries["id"],
        description="electricity bill",
        occurred_on="2026-08-05",
    )

    response = client.get("/api/transactions?q=groceries")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["description"] == "weekly groceries"


def test_list_transactions_search_is_case_insensitive(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="Weekly Groceries",
        occurred_on="2026-08-01",
    )

    response = client.get("/api/transactions?q=GROCERIES")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


def test_list_transactions_combined_filters(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="groceries august",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="20.00",
        category_id=groceries["id"],
        description="groceries july",
        occurred_on="2026-07-01",
    )

    response = client.get("/api/transactions?q=groceries&year=2026&month=8")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["amount"] == "10.00"


def test_list_transactions_month_without_year_returns_400(client: TestClient) -> None:
    response = client.get("/api/transactions?month=8")

    assert response.status_code == 400


def test_transaction_type_is_derived_from_category(client: TestClient) -> None:
    category = create_category(client, "gifts", "expense")
    transaction = create_transaction(
        client,
        amount="10.00",
        category_id=category["id"],
        description="present",
        occurred_on="2026-08-05",
    )

    assert transaction["transaction_type"] == "expense"

    response = client.patch(
        f"/api/categories/{category['id']}",
        json={"transaction_type": "income"},
    )
    assert response.status_code == 200

    updated = client.get(f"/api/transactions/{transaction['id']}")
    assert updated.status_code == 200
    assert updated.json()["transaction_type"] == "income"


def test_retype_category_affects_reports(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=category["id"],
        description="food",
        occurred_on="2026-08-05",
    )

    summary_before = client.get("/api/transactions/summary?year=2026&month=8").json()
    assert summary_before["expense"] == "10.00"
    assert summary_before["income"] == "0"

    response = client.patch(
        f"/api/categories/{category['id']}",
        json={"transaction_type": "income"},
    )
    assert response.status_code == 200

    summary_after = client.get("/api/transactions/summary?year=2026&month=8").json()
    assert summary_after["expense"] == "0"
    assert summary_after["income"] == "10.00"


def test_update_transaction_changes_type_via_category(client: TestClient) -> None:
    expense_category = create_category(client, "groceries", "expense")
    income_category = create_category(client, "salary", "income")
    transaction = create_transaction(
        client,
        amount="10.00",
        category_id=expense_category["id"],
        description="food",
        occurred_on="2026-08-05",
    )

    assert transaction["transaction_type"] == "expense"

    response = client.patch(
        f"/api/transactions/{transaction['id']}",
        json={"category_id": income_category["id"]},
    )

    assert response.status_code == 200
    assert response.json()["transaction_type"] == "income"
