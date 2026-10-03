"""Seed the local database with ~10 years of realistic demo data.

WARNING: this script DELETES ALL DATA in the database it connects to, then
inserts a demo user with fake transactions so the app can be shown with
realistic-looking data. It is meant for LOCAL demo only — never run it
against a production database.

Usage (from the backend directory):
    uv run python scripts/seed_demo_data.py
"""

from __future__ import annotations

from sqlalchemy.orm import Session as OrmSession

from pynance.database import Base, SessionLocal
from pynance.models import (
    Asset,
    BalanceAdjustment,
    Bucket,
    Category,
    LinkCode,
    RecurringTemplate,
    Session,
    TelegramLink,
    Transaction,
    Transfer,
    User,
)
from pynance.services.demo_data import generate_demo_data
from pynance.services.security import hash_password

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


def clean_all(db: OrmSession) -> None:
    """Delete every row, children first so FK constraints hold."""
    models: tuple[type[Base], ...] = (
        LinkCode,
        TelegramLink,
        RecurringTemplate,
        Transfer,
        Transaction,
        BalanceAdjustment,
        Session,
        Asset,
        Bucket,
        Category,
        User,
    )
    for model in models:
        db.query(model).delete()
    db.commit()


def create_demo_user(db: OrmSession) -> User:
    user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed(db: OrmSession) -> None:
    clean_all(db)
    user = create_demo_user(db)
    result = generate_demo_data(db, user.id, seed=42)

    print(f"Seeded {result.transactions_created} transactions for {DEMO_EMAIL}")
    print(f"  transfers:   {result.transfers_created}")
    print(f"  adjustments: {result.adjustments_created}")
    print(f"  email:       {DEMO_EMAIL}")
    print(f"  password:    {DEMO_PASSWORD}")


if __name__ == "__main__":
    with SessionLocal() as session:
        seed(session)
