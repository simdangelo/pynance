import pytest
from fastapi.testclient import TestClient

from pynance.database import SessionLocal
from pynance.services import telegram_link as telegram_link_service
from pynance.services.exceptions import (
    ChatAlreadyLinkedError,
    InvalidLinkCodeError,
    LinkCodeExpiredError,
    UserAlreadyLinkedError,
)
from tests.conftest import create_user, login


def test_request_link_code_requires_auth(anon_client: TestClient) -> None:
    response = anon_client.post("/api/telegram/link-code")
    assert response.status_code == 401


def test_request_link_code_returns_code(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    response = anon_client.post("/api/telegram/link-code")
    assert response.status_code == 201
    code = response.json()["code"]
    assert isinstance(code, str) and len(code) > 5


def test_link_chat_consumes_code_and_links(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    code = anon_client.post("/api/telegram/link-code").json()["code"]

    with SessionLocal() as session:
        link = telegram_link_service.link_chat(session, code, "123456789")
        assert link.chat_id == "123456789"
        user_id = telegram_link_service.get_user_by_chat(session, "123456789")
        assert user_id is not None

        # same code cannot be used twice
        try:
            telegram_link_service.link_chat(session, code, "987654321")
            pytest.fail("expected InvalidLinkCodeError")
        except InvalidLinkCodeError:
            pass


def test_link_chat_rejects_chat_already_linked(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    code = anon_client.post("/api/telegram/link-code").json()["code"]
    with SessionLocal() as session:
        telegram_link_service.link_chat(session, code, "123456789")
        # a second user cannot link the same chat
        create_user(anon_client, "bob@example.com")
        login(anon_client, "bob@example.com")
        code2 = anon_client.post("/api/telegram/link-code").json()["code"]
        try:
            telegram_link_service.link_chat(session, code2, "123456789")
            pytest.fail("expected ChatAlreadyLinkedError")
        except ChatAlreadyLinkedError:
            pass


def test_link_chat_rejects_user_already_linked(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    code = anon_client.post("/api/telegram/link-code").json()["code"]
    with SessionLocal() as session:
        telegram_link_service.link_chat(session, code, "123456789")
        # the same user cannot link a second chat
        code2 = anon_client.post("/api/telegram/link-code").json()["code"]
        try:
            telegram_link_service.link_chat(session, code2, "999999999")
            pytest.fail("expected UserAlreadyLinkedError")
        except UserAlreadyLinkedError:
            pass


def test_link_chat_rejects_invalid_code(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    with SessionLocal() as session:
        try:
            telegram_link_service.link_chat(session, "not-a-real-code", "123456789")
            pytest.fail("expected InvalidLinkCodeError")
        except InvalidLinkCodeError:
            pass


def test_link_chat_rejects_expired_code(anon_client: TestClient) -> None:
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from pynance.models.telegram_link import LinkCode

    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    code = anon_client.post("/api/telegram/link-code").json()["code"]
    with SessionLocal() as session:
        row = session.execute(select(LinkCode).where(LinkCode.code == code)).scalar_one()
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
        try:
            telegram_link_service.link_chat(session, code, "123456789")
            pytest.fail("expected LinkCodeExpiredError")
        except LinkCodeExpiredError:
            pass


def test_unlink_removes_link(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    code = anon_client.post("/api/telegram/link-code").json()["code"]
    with SessionLocal() as session:
        telegram_link_service.link_chat(session, code, "123456789")
        assert telegram_link_service.get_user_by_chat(session, "123456789") is not None
        telegram_link_service.unlink_chat(session, "123456789")
        assert telegram_link_service.get_user_by_chat(session, "123456789") is None
