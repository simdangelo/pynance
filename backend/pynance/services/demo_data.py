"""Generate realistic fake data for one user (local/demo use only).

Shared by the seed script (`scripts/seed_demo_data.py`) and the dev-only
"generate fake transactions" endpoint. It only touches the given user's rows:
movements are reset and rebuilt, categories/assets/buckets/templates are
created when missing and reused otherwise.

The generator is deliberately irregular: yearly raises, occasional months
without salary, rent jumps, seasonal spending and one-off events, so charts
and reports do not look like a flat repeating pattern.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from pynance.models import (
    Asset,
    AssetClass,
    BalanceAdjustment,
    Bucket,
    Category,
    RecurringTemplate,
    Transaction,
    TransactionType,
    Transfer,
    User,
)
from pynance.models.types import Frequency
from pynance.services.bucket import seed_default_buckets

DEMO_INCOME_CATEGORIES = ["Stipendio", "Bonus", "Extra", "Interessi", "Rimborso"]
DEMO_EXPENSE_CATEGORIES = [
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
DEMO_ASSET_SPECS: list[tuple[str, AssetClass, str, Decimal]] = [
    ("Conto Corrente", AssetClass.CURRENT_ACCOUNT, "Liquidità quotidiana", Decimal("2000")),
    ("Conto Risparmio", AssetClass.DEPOSIT_ACCOUNT, "Fondo di emergenza", Decimal("0")),
    ("ETF MSCI World", AssetClass.EQUITY_ETF, "Investimenti", Decimal("0")),
    ("ETF Obbligazionario", AssetClass.BOND_ETF, "Investimenti", Decimal("0")),
]

YEARS = 10


@dataclass(frozen=True)
class DemoDataResult:
    transactions_created: int
    transfers_created: int
    adjustments_created: int


@dataclass(frozen=True)
class _YearPlan:
    salary_factor: Decimal
    rent_factor: Decimal
    subs_factor: Decimal
    skip_salary_months: frozenset[int]
    # (month, category, description, amount)
    events: tuple[tuple[int, str, str, Decimal], ...]


def _ensure_categories(db: Session, user_id: int) -> dict[str, Category]:
    existing = {
        category.name: category
        for category in db.execute(select(Category).where(Category.user_id == user_id)).scalars()
    }
    categories: dict[str, Category] = {}
    for name in DEMO_INCOME_CATEGORIES:
        category = existing.get(name)
        if category is None:
            category = Category(name=name, transaction_type=TransactionType.INCOME, user_id=user_id)
            db.add(category)
        categories[name] = category
    for name in DEMO_EXPENSE_CATEGORIES:
        category = existing.get(name)
        if category is None:
            category = Category(
                name=name, transaction_type=TransactionType.EXPENSE, user_id=user_id
            )
            db.add(category)
        categories[name] = category
    db.flush()
    return categories


def _ensure_assets(db: Session, user_id: int) -> dict[str, Asset]:
    seed_default_buckets(db, user_id)
    buckets = list(
        db.execute(
            select(Bucket).where(Bucket.user_id == user_id).order_by(Bucket.sort_order)
        ).scalars()
    )
    buckets_by_name = {bucket.name: bucket for bucket in buckets}
    existing = {
        asset.name: asset
        for asset in db.execute(select(Asset).where(Asset.user_id == user_id)).scalars()
    }

    assets: dict[str, Asset] = {}
    for name, asset_class, bucket_name, opening_balance in DEMO_ASSET_SPECS:
        asset = existing.get(name)
        if asset is None:
            bucket = buckets_by_name.get(bucket_name) or (buckets[0] if buckets else None)
            if bucket is None:
                continue
            asset = Asset(
                name=name,
                asset_class=asset_class,
                bucket_id=bucket.id,
                user_id=user_id,
                opening_balance=opening_balance,
            )
            db.add(asset)
        assets[name] = asset
    db.flush()
    return assets


def _reset_movements(db: Session, user_id: int) -> None:
    db.execute(delete(Transaction).where(Transaction.user_id == user_id))
    db.execute(delete(Transfer).where(Transfer.user_id == user_id))
    db.execute(delete(BalanceAdjustment).where(BalanceAdjustment.user_id == user_id))


def _month_days(year: int, month: int) -> int:
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days


def _random_day(rng: random.Random, year: int, month: int) -> date:
    return date(year, month, rng.randint(1, _month_days(year, month)))


def _plan_years(rng: random.Random, start_year: int, end_year: int) -> dict[int, _YearPlan]:
    """Pre-roll the year-by-year story: raises, rent jumps, events, lean months."""
    plans: dict[int, _YearPlan] = {}
    salary_factor = Decimal("1")
    rent_factor = Decimal("1")
    subs_factor = Decimal("1")

    for year in range(start_year, end_year + 1):
        salary_raise = Decimal(str(rng.uniform(0.0, 0.045)))
        if rng.random() < 0.10:  # job change / promotion
            salary_raise = Decimal(str(rng.uniform(0.08, 0.15)))
        salary_factor *= Decimal("1") + salary_raise

        rent_raise = Decimal("0.015")
        if rng.random() < 0.35:  # contract renewal
            rent_raise += Decimal(str(rng.uniform(0.02, 0.05)))
        rent_factor *= Decimal("1") + rent_raise

        subs_factor *= Decimal("1") + Decimal(str(rng.uniform(0.0, 0.05)))

        skip_months: set[int] = set()
        if rng.random() < 0.07:  # a lean period without salary
            first_month = rng.randint(2, 9)
            for offset in range(rng.randint(1, 3)):
                skip_months.add(first_month + offset)

        events: list[tuple[int, str, str, Decimal]] = []
        if rng.random() < 0.35:
            events.append(
                (
                    rng.randint(3, 11),
                    "Extra",
                    "Vendita usato",
                    Decimal(str(rng.randint(80, 450))),
                )
            )
        if rng.random() < 0.30:
            events.append(
                (
                    rng.randint(2, 11),
                    "Trasporti",
                    "Riparazione auto",
                    Decimal(str(rng.randint(250, 900))),
                )
            )
        if rng.random() < 0.25:
            events.append(
                (
                    rng.randint(2, 11),
                    "Shopping",
                    "Elettrodomestico",
                    Decimal(str(rng.randint(300, 1200))),
                )
            )
        if rng.random() < 0.25:
            events.append(
                (
                    rng.randint(2, 11),
                    "Salute",
                    "Visita specialistica",
                    Decimal(str(rng.randint(120, 500))),
                )
            )
        if rng.random() < 0.20:
            events.append(
                (
                    rng.randint(2, 11),
                    "Viaggi",
                    "Vacanza",
                    Decimal(str(rng.randint(400, 1400))),
                )
            )

        plans[year] = _YearPlan(
            salary_factor=salary_factor,
            rent_factor=rent_factor,
            subs_factor=subs_factor,
            skip_salary_months=frozenset(skip_months),
            events=tuple(events),
        )
    return plans


def _salary_for(d: date, plans: dict[int, _YearPlan]) -> Decimal:
    factor = plans[d.year].salary_factor
    return (Decimal("2350") * factor).quantize(Decimal("0.01"))


def _rent_for(d: date, plans: dict[int, _YearPlan]) -> Decimal:
    factor = plans[d.year].rent_factor
    return (Decimal("780") * factor).quantize(Decimal("0.01"))


def _money(rng: random.Random, low: int, high: int, factor: Decimal = Decimal("1")) -> Decimal:
    return (Decimal(str(rng.randint(low, high))) * factor).quantize(Decimal("0.01"))


def _month_transactions(
    d: date,
    rng: random.Random,
    user_id: int,
    categories: dict[str, Category],
    assets: dict[str, Asset],
    plans: dict[int, _YearPlan],
) -> list[Transaction]:
    y, m = d.year, d.month
    plan = plans[y]
    checking = assets["Conto Corrente"].id

    def tx(cat_name: str, desc: str, amount: Decimal, day: int) -> Transaction:
        return Transaction(
            amount=amount,
            category_id=categories[cat_name].id,
            asset_id=checking,
            description=desc,
            occurred_on=date(y, m, day),
            user_id=user_id,
        )

    rows: list[Transaction] = []

    # Income: salary with monthly noise, skipped in lean months.
    if m not in plan.skip_salary_months:
        noise = Decimal(str(1 + rng.uniform(-0.02, 0.02)))
        rows.append(
            tx(
                "Stipendio",
                "Stipendio mensile",
                (_salary_for(d, plans) * noise).quantize(Decimal("0.01")),
                27,
            )
        )
    if m == 12:
        rows.append(tx("Bonus", "Tredicesima", _salary_for(d, plans), 15))
    if rng.random() < 0.12:
        rows.append(tx("Extra", "Lavoretto extra", _money(rng, 120, 600), rng.randint(5, 25)))

    for event_month, category, description, amount in plan.events:
        if event_month == m:
            rows.append(tx(category, description, amount, rng.randint(3, 26)))

    # Fixed costs (subscriptions drift up over the years).
    rows.append(tx("Affitto", "Affitto appartamento", _rent_for(d, plans), 1))
    rows.append(tx("Bollette", "Luce e gas", _money(rng, 80, 180), rng.randint(3, 9)))
    rows.append(tx("Bollette", "Internet e telefono", Decimal("49.90"), 12))
    rows.append(tx("Abbonamenti", "Netflix", _money(rng, 16, 20, plan.subs_factor), 15))
    rows.append(tx("Abbonamenti", "Spotify", _money(rng, 9, 12, plan.subs_factor), 18))
    rows.append(tx("Abbonamenti", "Palestra", _money(rng, 40, 55, plan.subs_factor), 5))

    # Groceries: more expensive around Christmas.
    groceries_factor = Decimal("1.25") if m == 12 else Decimal("1")
    supermarkets = ["Coop", "Conad", "Esselunga", "Lidl", "Carrefour"]
    for _ in range(rng.randint(3, 5)):
        rows.append(
            tx(
                "Spesa",
                f"Spesa {rng.choice(supermarkets)}",
                _money(rng, 25, 95, groceries_factor),
                rng.randint(2, 26),
            )
        )

    places = ["Pizzeria Bella Napoli", "Ristorante Da Mario", "Sushi Wok", "McDonald's"]
    for _ in range(rng.randint(2, 5)):
        rows.append(tx("Ristoranti", rng.choice(places), _money(rng, 14, 60), rng.randint(2, 28)))

    stations = ["Eni", "Tamoil", "Esso", "Q8"]
    for _ in range(rng.randint(1, 3)):
        rows.append(
            tx(
                "Carburante",
                f"Benzina {rng.choice(stations)}",
                _money(rng, 45, 85),
                rng.randint(4, 26),
            )
        )

    rows.append(tx("Trasporti", "Abbonamento trasporto pubblico", Decimal("39.00"), 2))

    if rng.random() < 0.25:
        rows.append(
            tx("Trasporti", "Trenitalia - Frecciarossa", _money(rng, 40, 140), rng.randint(5, 25))
        )
    if rng.random() < 0.30:
        rows.append(tx("Salute", "Farmacia", _money(rng, 8, 50), rng.randint(1, 28)))
    if rng.random() < 0.35:
        rows.append(
            tx("Intrattenimento", "Cinema The Space", _money(rng, 12, 32), rng.randint(3, 27))
        )
    if rng.random() < 0.30:
        rows.append(
            tx("Intrattenimento", "Concerti e eventi", _money(rng, 25, 110), rng.randint(3, 27))
        )

    shopping_factor = Decimal("1")
    if m == 12:
        shopping_factor = Decimal("1.7")  # gifts
    elif m in (1, 2):
        shopping_factor = Decimal("0.7")  # post-holiday lull
    if rng.random() < 0.45:
        shop = rng.choice(["Amazon", "Zalando", "Decathlon", "MediaWorld"])
        rows.append(tx("Shopping", shop, _money(rng, 20, 150, shopping_factor), rng.randint(2, 27)))

    travel_chance = 0.35 if m in (7, 8) else 0.15
    travel_factor = Decimal("1.4") if m in (7, 8) else Decimal("1")
    if rng.random() < travel_chance:
        trip = rng.choice(["Booking.com", "Airbnb", "Ryanair", "Italo"])
        rows.append(tx("Viaggi", trip, _money(rng, 120, 500, travel_factor), rng.randint(3, 25)))

    return rows


def _ensure_templates(
    db: Session,
    user_id: int,
    categories: dict[str, Category],
    today: date,
    plans: dict[int, _YearPlan],
) -> None:
    existing = {
        template.description
        for template in db.execute(
            select(RecurringTemplate).where(RecurringTemplate.user_id == user_id)
        ).scalars()
    }
    current_month = date(today.year, today.month, 1)
    specs = [
        ("Affitto appartamento", _rent_for(current_month, plans), "Affitto", current_month),
        ("Netflix", Decimal("17.99"), "Abbonamenti", date(today.year, today.month, 15)),
        (
            "Stipendio mensile",
            _salary_for(current_month, plans),
            "Stipendio",
            date(today.year, today.month, 27),
        ),
    ]
    for description, amount, category_name, next_occurrence in specs:
        if description in existing:
            continue
        db.add(
            RecurringTemplate(
                description=description,
                amount=amount,
                category_id=categories[category_name].id,
                frequency=Frequency.MONTHLY,
                next_occurrence=next_occurrence,
                active=True,
                user_id=user_id,
            )
        )


def generate_demo_data(db: Session, user_id: int, seed: int | None = None) -> DemoDataResult:
    """Reset the user's movements and rebuild ~10 years of fake data.

    With `seed=None` every call produces different data (the dev button);
    a fixed seed makes the seed script reproducible.
    """
    rng = random.Random(seed)
    today = datetime.now(UTC).date()
    start_date = date(today.year - YEARS, 1, 1)
    plans = _plan_years(rng, start_date.year, today.year)

    _reset_movements(db, user_id)
    categories = _ensure_categories(db, user_id)
    assets = _ensure_assets(db, user_id)
    checking = assets["Conto Corrente"].id
    savings = assets["Conto Risparmio"].id
    equity_etf = assets["ETF MSCI World"].id
    bond_etf = assets["ETF Obbligazionario"].id

    user = db.get(User, user_id)
    if user is not None and user.default_asset_id is None:
        user.default_asset_id = checking

    invest_from_year = start_date.year + 3
    transactions: list[Transaction] = []
    transfers: list[Transfer] = []
    adjustments: list[BalanceAdjustment] = []

    y, m = start_date.year, start_date.month
    while (y, m) <= (today.year, today.month):
        month = date(y, m, 1)
        transactions.extend(_month_transactions(month, rng, user_id, categories, assets, plans))

        transfers.append(
            Transfer(
                source_asset_id=checking,
                destination_asset_id=savings,
                amount=_money(rng, 150, 400),
                description="Risparmio mensile",
                occurred_on=_random_day(rng, y, m),
                user_id=user_id,
            )
        )
        if y >= invest_from_year:
            transfers.append(
                Transfer(
                    source_asset_id=checking,
                    destination_asset_id=equity_etf,
                    amount=_money(rng, 100, 400),
                    description="Piano di accumulo ETF azionario",
                    occurred_on=_random_day(rng, y, m),
                    user_id=user_id,
                )
            )
            if m % 3 == 0:
                transfers.append(
                    Transfer(
                        source_asset_id=checking,
                        destination_asset_id=bond_etf,
                        amount=_money(rng, 100, 300),
                        description="Piano di accumulo ETF obbligazionario",
                        occurred_on=_random_day(rng, y, m),
                        user_id=user_id,
                    )
                )

        if m == 12:
            adjustments.append(
                BalanceAdjustment(
                    asset_id=savings,
                    amount=_money(rng, 150, 350),
                    occurred_on=date(y, 12, 31),
                    note=f"Interessi {y}",
                    user_id=user_id,
                )
            )
            adjustments.append(
                BalanceAdjustment(
                    asset_id=equity_etf,
                    amount=_money(rng, 40, 180),
                    occurred_on=date(y, 12, 31),
                    note=f"Dividendi {y}",
                    user_id=user_id,
                )
            )
            adjustments.append(
                BalanceAdjustment(
                    asset_id=bond_etf,
                    amount=_money(rng, 30, 140),
                    occurred_on=date(y, 12, 31),
                    note=f"Cedole {y}",
                    user_id=user_id,
                )
            )

        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    db.add_all(transactions)
    db.add_all(transfers)
    db.add_all(adjustments)
    _ensure_templates(db, user_id, categories, today, plans)
    db.commit()

    return DemoDataResult(
        transactions_created=len(transactions),
        transfers_created=len(transfers),
        adjustments_created=len(adjustments),
    )
