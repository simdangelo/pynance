from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from pynance.config import settings

engine = create_engine(settings.resolved_database_url)

SessionLocal = sessionmaker(autoflush=False, bind=engine, expire_on_commit=False)


# Base class for models
class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session]:
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
