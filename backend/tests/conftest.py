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
from pynance.models.category import Category
from pynance.models.transaction import Transaction

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
    session.execute(delete(Transaction))
    session.execute(delete(Category))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient]:
    def override_get_db() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def create_category(client: TestClient, name: str, transaction_type: str) -> dict[str, Any]:
    response = client.post(
        "/api/categories",
        json={"name": name, "transaction_type": transaction_type},
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
) -> dict[str, Any]:
    response = client.post(
        "/api/transactions",
        json={
            "amount": amount,
            "category_id": category_id,
            "description": description,
            "occurred_on": occurred_on,
        },
    )
    assert response.status_code == 201, response.text
    return cast("dict[str, Any]", response.json())
