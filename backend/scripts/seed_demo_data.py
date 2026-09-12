"""Seed the local database with ~10 years of realistic demo data.

WARNING: this script DELETES ALL DATA in the database it connects to, then
inserts a demo user with fake transactions so the app can be shown with
realistic-looking data. It is meant for LOCAL demo only — never run it
against a production database.

Usage (from the backend directory):
    uv run python scripts/seed_demo_data.py
"""

from __future__ import annotations

import random
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session as OrmSession

from pynance.database import Base, SessionLocal
from pynance.models import (
    Asset,
    AssetType,
    Category,
    LinkCode,
    RecurringTemplate,
    Session,
    TelegramLink,
    Transaction,
    TransactionType,
    Transfer,
    User,
)
from pynance.models.types import Frequency
from pynance.schemas.transaction import TransactionCreate
from pynance.schemas.transfer import TransferCreate
from pynance.services import transaction as transaction_service
from pynance.services import transfer as transfer_service
from pynance.services.security import hash_password

rng = random.Random(42)

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"

TODAY = datetime.now(UTC).date()
START_DATE = date(TODAY.year - 10, 1, 1)


def clean_all(db: OrmSession) -> None:
    """Delete every row, children first so FK constraints hold."""
    models: tuple[type[Base], ...] = (
        LinkCode,
        TelegramLink,
        RecurringTemplate,
        Transfer,
        Transaction,
        Session,
        Asset,
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


def create_categories(db: OrmSession, user: User) -> dict[str, Category]:
    """Income and expense categories; expense ones carry realistic merchant names."""
    categories: dict[str, Category] = {}

    income_names = ["Stipendio", "Bonus", "Interessi", "Rimborso"]
    for name in income_names:
        cat = Category(name=name, transaction_type=TransactionType.INCOME, user_id=user.id)
        db.add(cat)
        categories[name] = cat

    expense_names = [
        "Affitto",
        "Spesa",
        "Bollette",
        "Ristoranti",
        "Carburante",
        "Abbonamenti",
        "Salute",
        "Trasporti",
        "Intrattenimento",
        "Shopping",
        "Viaggi",
    ]
    for name in expense_names:
        cat = Category(name=name, transaction_type=TransactionType.EXPENSE, user_id=user.id)
        db.add(cat)
        categories[name] = cat

    db.commit()
    return categories


def create_assets(db: OrmSession, user: User) -> dict[str, Asset]:
    specs = [
        ("Conto Corrente", AssetType.LIQUID),
        ("Conto Risparmio", AssetType.SAVINGS),
        ("ETF MSCI World", AssetType.ETF),
    ]
    assets: dict[str, Asset] = {}
    for name, asset_type in specs:
        asset = Asset(
            name=name, asset_type=asset_type, user_id=user.id, opening_balance=Decimal("0")
        )
        db.add(asset)
        assets[name] = asset
    db.commit()
    return assets


def month_days(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days


def random_day(year: int, month: int) -> date:
    day = rng.randint(1, month_days(year, month))
    return date(year, month, day)


def _salary_for(d: date) -> Decimal:
    """Salary grows slowly over the years, paid on the 27th."""
    years = (d.year - START_DATE.year) + (d.month - START_DATE.month) / 12
    base = Decimal("2350")
    growth = Decimal("1") + Decimal("0.025") * Decimal(str(years))
    return (base * growth).quantize(Decimal("0.01"))


def _rent_for(d: date) -> Decimal:
    years = (d.year - START_DATE.year) + (d.month - START_DATE.month) / 12
    base = Decimal("780")
    growth = Decimal("1") + Decimal("0.015") * Decimal(str(years))
    return (base * growth).quantize(Decimal("0.01"))


def month_transactions(
    d: date, categories: dict[str, Category], assets: dict[str, Asset]
) -> list[TransactionCreate]:
    """Build a realistic set of transactions for one month."""
    y, m = d.year, d.month
    checking = assets["Conto Corrente"].id

    def tx(cat_name: str, desc: str, amount: Decimal, day: int) -> TransactionCreate:
        return TransactionCreate(
            amount=amount,
            category_id=categories[cat_name].id,
            asset_id=checking,
            description=desc,
            occurred_on=date(y, m, day),
        )

    rows: list[TransactionCreate] = []

    rows.append(tx("Stipendio", "Stipendio mensile", _salary_for(d), 27))
    if m == 12:
        rows.append(tx("Bonus", "Tredicesima", _salary_for(d), 15))

    rows.append(tx("Affitto", "Affitto appartamento", _rent_for(d), 1))
    rows.append(tx("Bollette", "Luce e gas", Decimal(str(rng.randint(80, 160))), rng.randint(3, 9)))
    rows.append(tx("Bollette", "Internet e telefono", Decimal("49.90"), 12))
    rows.append(tx("Abbonamenti", "Netflix", Decimal("17.99"), 15))
    rows.append(tx("Abbonamenti", "Spotify", Decimal("9.99"), 18))
    rows.append(tx("Abbonamenti", "Palestra", Decimal("45.00"), 5))

    supermarkets = ["Coop", "Conad", "Esselunga", "Lidl", "Carrefour"]
    for _ in range(rng.randint(3, 4)):
        rows.append(
            tx(
                "Spesa",
                f"Spesa {rng.choice(supermarkets)}",
                Decimal(str(rng.randint(25, 90))),
                rng.randint(2, 26),
            )
        )

    places = ["Pizzeria Bella Napoli", "Ristorante Da Mario", "Sushi Wok", "McDonald's"]
    for _ in range(rng.randint(2, 4)):
        rows.append(
            tx(
                "Ristoranti",
                rng.choice(places),
                Decimal(str(rng.randint(14, 55))),
                rng.randint(2, 28),
            )
        )

    stations = ["Eni", "Tamoil", "Esso", "Q8"]
    for _ in range(rng.randint(1, 3)):
        rows.append(
            tx(
                "Carburante",
                f"Benzina {rng.choice(stations)}",
                Decimal(str(rng.randint(45, 75))),
                rng.randint(4, 26),
            )
        )

    rows.append(tx("Trasporti", "Abbonamento trasporto pubblico", Decimal("39.00"), 2))

    if rng.random() < 0.25:
        rows.append(
            tx(
                "Trasporti",
                "Trenitalia - Frecciarossa",
                Decimal(str(rng.randint(40, 130))),
                rng.randint(5, 25),
            )
        )
    if rng.random() < 0.30:
        rows.append(tx("Salute", "Farmacia", Decimal(str(rng.randint(8, 45))), rng.randint(1, 28)))
    if rng.random() < 0.35:
        rows.append(
            tx(
                "Intrattenimento",
                "Cinema The Space",
                Decimal(str(rng.randint(12, 30))),
                rng.randint(3, 27),
            )
        )
    if rng.random() < 0.30:
        rows.append(
            tx(
                "Intrattenimento",
                "Concerti e eventi",
                Decimal(str(rng.randint(25, 90))),
                rng.randint(3, 27),
            )
        )
    if rng.random() < 0.40:
        shop = rng.choice(["Amazon", "Zalando", "Decathlon", "MediaWorld"])
        rows.append(tx("Shopping", shop, Decimal(str(rng.randint(20, 140))), rng.randint(2, 27)))
    if rng.random() < 0.15:
        trip = rng.choice(["Booking.com", "Airbnb", "Ryanair", "Italo"])
        rows.append(tx("Viaggi", trip, Decimal(str(rng.randint(120, 480))), rng.randint(3, 25)))

    return rows


def seed(db: OrmSession) -> None:
    clean_all(db)
    user = create_demo_user(db)
    categories = create_categories(db, user)
    assets = create_assets(db, user)

    y, m = START_DATE.year, START_DATE.month
    created = 0
    while (y, m) <= (TODAY.year, TODAY.month):
        month = date(y, m, 1)
        for tx in month_transactions(month, categories, assets):
            transaction_service.create_transaction(db, user.id, tx)
            created += 1

        transfer_service.create_transfer(
            db,
            user.id,
            TransferCreate(
                source_asset_id=assets["Conto Corrente"].id,
                destination_asset_id=assets["Conto Risparmio"].id,
                amount=Decimal(str(rng.randint(150, 400))),
                description="Risparmio mensile",
                occurred_on=random_day(y, m),
            ),
        )

        if m == 12:
            y += 1
            m = 1
        else:
            m += 1

    current_month = date(TODAY.year, TODAY.month, 1)
    db.add_all(
        [
            RecurringTemplate(
                description="Affitto appartamento",
                amount=_rent_for(current_month),
                category_id=categories["Affitto"].id,
                frequency=Frequency.MONTHLY,
                next_occurrence=current_month,
                active=True,
                user_id=user.id,
            ),
            RecurringTemplate(
                description="Netflix",
                amount=Decimal("17.99"),
                category_id=categories["Abbonamenti"].id,
                frequency=Frequency.MONTHLY,
                next_occurrence=date(TODAY.year, TODAY.month, 15),
                active=True,
                user_id=user.id,
            ),
            RecurringTemplate(
                description="Stipendio mensile",
                amount=_salary_for(current_month),
                category_id=categories["Stipendio"].id,
                frequency=Frequency.MONTHLY,
                next_occurrence=date(TODAY.year, TODAY.month, 27),
                active=True,
                user_id=user.id,
            ),
        ]
    )
    db.commit()

    print(f"Seeded {created} transactions for {DEMO_EMAIL}")
    print(f"  email:    {DEMO_EMAIL}")
    print(f"  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    with SessionLocal() as session:
        seed(session)
