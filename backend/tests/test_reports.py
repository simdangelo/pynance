from fastapi.testclient import TestClient

from tests.conftest import create_category, create_transaction, create_user, login


def test_monthly_summary(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="20.50",
        category_id=groceries["id"],
        description="more food",
        occurred_on="2026-08-15",
    )
    create_transaction(
        client,
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )
    create_transaction(
        client,
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
        occurred_on="2026-08-10",
    )

    response = client.get(
        "/api/transactions/summary-by-category?transaction_type=expense&year=2026&month=8"
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
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )

    response = client.get(
        "/api/transactions/summary-by-category?transaction_type=income&year=2026&month=8"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category_name"] == "salary"
    assert data[0]["amount"] == "100.00"


def test_spending_by_category_empty_month(client: TestClient) -> None:
    response = client.get(
        "/api/transactions/summary-by-category?transaction_type=expense&year=2026&month=1"
    )

    assert response.status_code == 200
    assert response.json() == []


def test_trend(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-07-05",
    )
    create_transaction(
        client,
        amount="20.50",
        category_id=groceries["id"],
        description="more food",
        occurred_on="2026-08-15",
    )
    create_transaction(
        client,
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )
    create_transaction(
        client,
        amount="5.00",
        category_id=groceries["id"],
        description="out of range",
        occurred_on="2026-06-30",
    )

    response = client.get("/api/transactions/trend?start_date=2026-07-01&end_date=2026-08-31")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    by_month = {(point["year"], point["month"]): point for point in data}
    assert by_month[(2026, 7)]["expense"] == "10.00"
    assert by_month[(2026, 7)]["income"] == "0"
    assert by_month[(2026, 7)]["count"] == 1
    assert by_month[(2026, 8)]["expense"] == "20.50"
    assert by_month[(2026, 8)]["income"] == "100.00"
    assert by_month[(2026, 8)]["count"] == 2


def test_trend_empty_range(client: TestClient) -> None:
    response = client.get("/api/transactions/trend?start_date=2026-01-01&end_date=2026-01-31")

    assert response.status_code == 200
    assert response.json() == []


def test_trend_by_category(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    bills = create_category(client, "bills", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-07-05",
    )
    create_transaction(
        client,
        amount="20.50",
        category_id=groceries["id"],
        description="more food",
        occurred_on="2026-08-15",
    )
    create_transaction(
        client,
        amount="5.00",
        category_id=bills["id"],
        description="electricity",
        occurred_on="2026-08-10",
    )

    response = client.get(
        "/api/transactions/trend-by-category?start_date=2026-07-01&end_date=2026-08-31"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    by_category = {row["category_name"]: row for row in data}

    groceries_trend = by_category["groceries"]
    assert len(groceries_trend["points"]) == 2
    groceries_by_month = {
        (point["year"], point["month"]): point["amount"] for point in groceries_trend["points"]
    }
    assert groceries_by_month[(2026, 7)] == "10.00"
    assert groceries_by_month[(2026, 8)] == "20.50"

    bills_trend = by_category["bills"]
    assert len(bills_trend["points"]) == 1
    assert bills_trend["points"][0]["amount"] == "5.00"


def test_trend_by_category_empty_range(client: TestClient) -> None:
    response = client.get(
        "/api/transactions/trend-by-category?start_date=2026-01-01&end_date=2026-01-31"
    )

    assert response.status_code == 200
    assert response.json() == []


def test_trend_excludes_category(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    donation = create_category(client, "donation", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="5000.00",
        category_id=donation["id"],
        description="family donation",
        occurred_on="2026-08-02",
    )
    create_transaction(
        client,
        amount="20.00",
        category_id=groceries["id"],
        description="more food",
        occurred_on="2026-09-01",
    )

    response = client.get(
        "/api/transactions/trend",
        params=[
            ("start_date", "2026-08-01"),
            ("end_date", "2026-09-30"),
            ("exclude_category_id", donation["id"]),
        ],
    )

    assert response.status_code == 200
    data = response.json()
    by_month = {(point["year"], point["month"]): point for point in data}
    assert by_month[(2026, 8)]["income"] == "0"
    assert by_month[(2026, 8)]["expense"] == "10.00"
    assert by_month[(2026, 8)]["count"] == 1
    assert by_month[(2026, 9)]["expense"] == "20.00"
    assert by_month[(2026, 9)]["count"] == 1


def test_trend_excludes_multiple_categories(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    donation = create_category(client, "donation", "income")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="5000.00",
        category_id=donation["id"],
        description="family donation",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-01",
    )

    response = client.get(
        "/api/transactions/trend",
        params=[
            ("start_date", "2026-08-01"),
            ("end_date", "2026-08-31"),
            ("exclude_category_id", donation["id"]),
            ("exclude_category_id", salary["id"]),
        ],
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["income"] == "0"
    assert data[0]["expense"] == "10.00"
    assert data[0]["count"] == 1


def test_trend_without_exclusions_includes_everything(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    donation = create_category(client, "donation", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="5000.00",
        category_id=donation["id"],
        description="family donation",
        occurred_on="2026-08-01",
    )

    response = client.get("/api/transactions/trend?start_date=2026-08-01&end_date=2026-08-31")

    assert response.status_code == 200
    data = response.json()
    assert data[0]["income"] == "5000.00"
    assert data[0]["expense"] == "10.00"
    assert data[0]["count"] == 2


def test_trend_by_category_omits_excluded_category(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    donation = create_category(client, "donation", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="5000.00",
        category_id=donation["id"],
        description="family donation",
        occurred_on="2026-08-02",
    )

    response = client.get(
        "/api/transactions/trend-by-category",
        params=[
            ("start_date", "2026-08-01"),
            ("end_date", "2026-08-31"),
            ("exclude_category_id", donation["id"]),
        ],
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category_name"] == "groceries"


def test_trend_ignores_another_users_category(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    alice_category = create_category(anon_client, "alice stuff", "expense")

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")
    bob_category = create_category(anon_client, "bob stuff", "expense")
    create_transaction(
        anon_client,
        amount="10.00",
        category_id=bob_category["id"],
        description="bob food",
        occurred_on="2026-08-01",
    )

    response = anon_client.get(
        "/api/transactions/trend",
        params=[
            ("start_date", "2026-08-01"),
            ("end_date", "2026-08-31"),
            ("exclude_category_id", alice_category["id"]),
        ],
    )

    assert response.status_code == 200
    data = response.json()
    assert data[0]["expense"] == "10.00"
    assert data[0]["count"] == 1


def test_comparison(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    salary = create_category(client, "salary", "income")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-08-01",
    )
    create_transaction(
        client,
        amount="100.00",
        category_id=salary["id"],
        description="salary",
        occurred_on="2026-08-20",
    )
    create_transaction(
        client,
        amount="30.00",
        category_id=groceries["id"],
        description="food last month",
        occurred_on="2026-07-10",
    )

    response = client.get("/api/transactions/comparison?year=2026&month=8")

    assert response.status_code == 200
    data = response.json()
    assert data["current"]["income"] == "100.00"
    assert data["current"]["expense"] == "10.00"
    assert data["previous"]["income"] == "0"
    assert data["previous"]["expense"] == "30.00"


def test_comparison_january_rollover(client: TestClient) -> None:
    groceries = create_category(client, "groceries", "expense")
    create_transaction(
        client,
        amount="10.00",
        category_id=groceries["id"],
        description="food",
        occurred_on="2026-01-05",
    )
    create_transaction(
        client,
        amount="7.50",
        category_id=groceries["id"],
        description="food in december",
        occurred_on="2025-12-20",
    )

    response = client.get("/api/transactions/comparison?year=2026&month=1")

    assert response.status_code == 200
    data = response.json()
    assert data["current"]["expense"] == "10.00"
    assert data["previous"]["expense"] == "7.50"
    assert data["previous"]["income"] == "0"
