from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from tests.conftest import create_category, create_recurring_template


def test_create_recurring_template(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")

    response = client.post(
        "/api/recurring-template",
        json={
            "description": "Rent",
            "amount": "500.00",
            "category_id": category["id"],
            "frequency": "monthly",
            "interval": 1,
            "next_occurrence": "2026-09-01",
            "active": True,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["description"] == "Rent"
    assert data["amount"] == "500.00"
    assert data["frequency"] == "monthly"
    assert data["next_occurrence"] == "2026-09-01"
    assert data["active"] is True
    assert "due" in data
    assert "id" in data


def test_create_recurring_template_unknown_category_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/recurring-template",
        json={
            "description": "Rent",
            "amount": "500.00",
            "category_id": 9999,
            "frequency": "monthly",
            "interval": 1,
            "next_occurrence": "2026-09-01",
            "active": True,
        },
    )

    assert response.status_code == 404


def test_list_recurring_templates(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-09-01",
    )
    create_recurring_template(
        client,
        description="Salary",
        amount="2000.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-09-01",
    )

    response = client.get("/api/recurring-template")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    descriptions = {template["description"] for template in data}
    assert descriptions == {"Rent", "Salary"}


def test_update_recurring_template(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-09-01",
    )

    response = client.patch(
        f"/api/recurring-template/{template['id']}",
        json={"amount": "550.00"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["amount"] == "550.00"
    assert data["description"] == "Rent"


def test_update_recurring_template_not_found_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/recurring-template/9999",
        json={"amount": "550.00"},
    )

    assert response.status_code == 404


def test_delete_recurring_template(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-09-01",
    )

    response = client.delete(f"/api/recurring-template/{template['id']}")

    assert response.status_code == 204
    assert client.get("/api/recurring-template").json() == []


def test_delete_recurring_template_not_found_returns_404(client: TestClient) -> None:
    response = client.delete("/api/recurring-template/9999")

    assert response.status_code == 404


def test_generate_next_creates_transaction_and_advances(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-06-01",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 201
    transaction = response.json()
    assert transaction["description"] == "Rent"
    assert transaction["amount"] == "500.00"
    assert transaction["occurred_on"] == "2026-06-01"
    assert transaction["transaction_type"] == "expense"

    assert client.get(f"/api/transactions/{transaction['id']}").status_code == 200

    templates = client.get("/api/recurring-template").json()
    assert templates[0]["next_occurrence"] == "2026-07-01"


def test_generate_next_weekly_advances_by_week(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Gym",
        amount="30.00",
        category_id=category["id"],
        frequency="weekly",
        next_occurrence="2026-06-01",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 201
    templates = client.get("/api/recurring-template").json()
    assert templates[0]["next_occurrence"] == "2026-06-08"


def test_generate_next_custom_interval_advances_by_interval_weeks(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Custom",
        amount="10.00",
        category_id=category["id"],
        frequency="custom",
        interval=2,
        next_occurrence="2026-06-01",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 201
    templates = client.get("/api/recurring-template").json()
    assert templates[0]["next_occurrence"] == "2026-06-15"


def test_generate_next_paused_template_returns_409(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-09-01",
        active=False,
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 409


def test_generate_next_not_due_returns_409(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2099-01-01",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 409
    templates = client.get("/api/recurring-template").json()
    assert templates[0]["next_occurrence"] == "2099-01-01"


def test_generate_next_not_found_returns_404(client: TestClient) -> None:
    response = client.post("/api/recurring-template/9999/generate")

    assert response.status_code == 404


def test_generate_next_twice_produces_distinct_dates(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-06-01",
    )

    first = client.post(f"/api/recurring-template/{template['id']}/generate")
    second = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["occurred_on"] == "2026-06-01"
    assert second.json()["occurred_on"] == "2026-07-01"


def test_due_flag(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    today = datetime.now(UTC).date()
    create_recurring_template(
        client,
        description="Past due",
        amount="10.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2020-01-01",
    )
    create_recurring_template(
        client,
        description="Due today",
        amount="10.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence=today.isoformat(),
    )
    create_recurring_template(
        client,
        description="Future",
        amount="10.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2099-01-01",
    )

    templates = client.get("/api/recurring-template").json()
    by_description = {template["description"]: template for template in templates}

    assert by_description["Past due"]["due"] is True
    assert by_description["Due today"]["due"] is True
    assert by_description["Future"]["due"] is False


def test_monthly_generation_clamps_end_of_month(client: TestClient) -> None:
    category = create_category(client, "groceries", "expense")
    template = create_recurring_template(
        client,
        description="Rent",
        amount="500.00",
        category_id=category["id"],
        frequency="monthly",
        next_occurrence="2026-01-31",
    )

    response = client.post(f"/api/recurring-template/{template['id']}/generate")

    assert response.status_code == 201
    templates = client.get("/api/recurring-template").json()
    next_occurrence = date.fromisoformat(templates[0]["next_occurrence"])
    assert next_occurrence.month == 2
    assert next_occurrence.day == 28
