from fastapi.testclient import TestClient

from tests.conftest import create_category, create_transaction


def test_monthly_summary(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        transaction_type="expense",
        amount="20.50",
        category_id=groceries["id"],
        description="more food",
        occurred_on="2026-08-15",
    )
    create_transaction(
        client,
        transaction_type="income",
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )
    create_transaction(
        client,
        transaction_type="expense",
        amount="5.00",
        category_id=groceries["id"],
        description="last month",
        occurred_on="2026-07-31",
    )

    response = client.get("/api/transactions/summary?year=2026&month=8")

    assert response.status_code == 200
    data = response.json()
    assert data["income"] == "100.00"
    assert data["expense"] == "30.50"


def test_monthly_summary_empty_month(client: TestClient) -> None:
    response = client.get("/api/transactions/summary?year=2026&month=1")

    assert response.status_code == 200
    data = response.json()
    assert data["income"] == "0"
    assert data["expense"] == "0"


def test_spending_by_category(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    bills = create_category(client, "bills", "expense")
    create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        transaction_type="expense",
        amount="25.00",
        category_id=bills["id"],
        description="electricity",
        occurred_on="2026-08-10",
    )

    response = client.get(
        "/api/transactions/spending-by-category?transaction_type=expense&year=2026&month=8"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    totals = {row["category_name"]: row["amount"] for row in data}
    assert totals["groceries"] == "10.00"
    assert totals["bills"] == "25.00"


def test_spending_by_category_filters_type(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        transaction_type="expense",
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        transaction_type="income",
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )

    response = client.get(
        "/api/transactions/spending-by-category?transaction_type=income&year=2026&month=8"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category_name"] == "salary"
    assert data[0]["amount"] == "100.00"


def test_spending_by_category_empty_month(client: TestClient) -> None:
    response = client.get(
        "/api/transactions/spending-by-category?transaction_type=expense&year=2026&month=1"
    )

    assert response.status_code == 200
    assert response.json() == []
