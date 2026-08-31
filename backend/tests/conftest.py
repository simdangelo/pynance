import os
from collections.abc import Generator
from typing import Any, cast

os.environ["POSTGRES_DB"] = "pynance_test_db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session, sessionmaker

from pynance.api.main import app
from pynance.database import Base, get_db
from pynance.models.asset import Asset
from pynance.models.category import Category
from pynance.models.recurring_template import RecurringTemplate
from pynance.models.session import Session as UserSession
from pynance.models.transaction import Transaction
from pynance.models.transfer import Transfer
from pynance.models.user import User

engine = create_engine(
    "postgresql+psycopg://app_user:app_user_password@localhost:5432/pynance_test_db"
)
TestingSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture(scope="session")
def setup_database() -> Generator[None]:
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db_session(setup_database: Generator[None]) -> Generator[Session]:
    session = TestingSessionLocal()
    session.execute(delete(UserSession))
    session.execute(delete(Transfer))
    session.execute(delete(Transaction))
    session.execute(delete(RecurringTemplate))
    session.execute(delete(Category))
    session.execute(delete(Asset))
    session.execute(delete(User))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    create_user(test_client)
    login(test_client)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def anon_client(db_session: Session) -> Generator[TestClient]:
    """A client without an authenticated user (for auth-specific tests)."""

    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def liquid_asset(client: TestClient) -> int:
    asset = create_asset(client, name="Liquid", asset_type="liquid")
    return cast("int", asset["id"])


def create_user(client: TestClient, email: str = "user@example.com") -> dict[str, Any]:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())


def login(client: TestClient, email: str = "user@example.com") -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 200, response.text


def create_category(client: TestClient, name: str, transaction_type: str) -> dict[str, Any]:
    response = client.post(
        "/api/categories",
        json={"name": name, "transaction_type": transaction_type},
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())


def create_asset(
    client: TestClient,
    *,
    name: str,
    asset_type: str,
    opening_balance: str = "0",
) -> dict[str, Any]:
    response = client.post(
        "/api/assets",
        json={"name": name, "asset_type": asset_type, "opening_balance": opening_balance},
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())


def create_transfer(
    client: TestClient,
    *,
    source_asset_id: int,
    destination_asset_id: int,
    amount: str,
    description: str,
    occurred_on: str,
) -> dict[str, Any]:
    response = client.post(
        "/api/transfers",
        json={
            "source_asset_id": source_asset_id,
            "destination_asset_id": destination_asset_id,
            "amount": amount,
            "description": description,
            "occurred_on": occurred_on,
        },
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())


def create_transaction(
    client: TestClient,
    *,
    amount: str,
    category_id: int,
    description: str,
    occurred_on: str,
    asset_id: int | None = None,
) -> dict[str, Any]:
    if asset_id is None:
        assets = client.get("/api/assets").json()
        liquid = next((a for a in assets if a["asset_type"] == "liquid"), None)
        if liquid is None:
            asset = create_asset(client, name="Liquid", asset_type="liquid")
            asset_id = cast("int", asset["id"])
        else:
            asset_id = cast("int", liquid["id"])

    response = client.post(
        "/api/transactions",
        json={
            "amount": amount,
            "category_id": category_id,
            "description": description,
            "occurred_on": occurred_on,
            "asset_id": asset_id,
        },
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())


def create_recurring_template(
    client: TestClient,
    *,
    description: str,
    amount: str,
    category_id: int,
    frequency: str,
    interval: int = 1,
    next_occurrence: str,
    active: bool = True,
) -> dict[str, Any]:
    response = client.post(
        "/api/recurring-template",
        json={
            "description": description,
            "amount": amount,
            "category_id": category_id,
            "frequency": frequency,
            "interval": interval,
            "next_occurrence": next_occurrence,
            "active": active,
        },
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())
