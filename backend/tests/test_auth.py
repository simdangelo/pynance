from fastapi.testclient import TestClient

from tests.conftest import create_category, create_user, login


def test_register_returns_201(anon_client: TestClient) -> None:
    user = create_user(anon_client, "alice@example.com")
    assert user["email"] == "alice@example.com"
    assert "id" in user


def test_register_duplicate_email_returns_409(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    response = anon_client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "password123"},
    )
    assert response.status_code == 409


def test_login_sets_cookie(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    response = anon_client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    assert "session_token" in response.headers.get("set-cookie", "")


def test_login_wrong_password_returns_401(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    response = anon_client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_login_unknown_email_returns_401(anon_client: TestClient) -> None:
    response = anon_client.post(
        "/api/auth/login",
        json={"email": "ghost@example.com", "password": "password123"},
    )
    assert response.status_code == 401


def test_me_returns_logged_in_user(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    response = anon_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


def test_me_without_auth_returns_401(anon_client: TestClient) -> None:
    response = anon_client.get("/api/auth/me")
    assert response.status_code == 401


def test_logout_clears_session(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    response = anon_client.post("/api/auth/logout")
    assert response.status_code == 204
    assert anon_client.get("/api/auth/me").status_code == 401


def test_user_a_cannot_modify_user_b_category(client: TestClient) -> None:
    # `client` is pre-authenticated as a default user (user A)
    category = create_category(client, "groceries", "expense")

    other = TestClient(client.app)
    other.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "password123"},
    )
    other.post(
        "/api/auth/login",
        json={"email": "bob@example.com", "password": "password123"},
    )
    response = other.patch(f"/api/categories/{category['id']}", json={"name": "stolen"})
    assert response.status_code == 404
