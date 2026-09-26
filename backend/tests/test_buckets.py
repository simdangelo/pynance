from fastapi.testclient import TestClient

from tests.conftest import create_asset, create_bucket, create_user, login


def test_register_creates_three_default_buckets(client: TestClient) -> None:
    response = client.get("/api/buckets")

    assert response.status_code == 200
    data = response.json()
    assert [bucket["name"] for bucket in data] == [
        "Liquidità quotidiana",
        "Fondo di emergenza",
        "Investimenti",
    ]
    assert [bucket["liquidity_category"] for bucket in data] == [
        "liquid",
        "reserve",
        "invested",
    ]
    assert [bucket["sort_order"] for bucket in data] == [0, 1, 2]


def test_create_bucket(client: TestClient) -> None:
    response = client.post(
        "/api/buckets",
        json={"name": "Casa", "liquidity_category": "invested", "description": "Down payment"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Casa"
    assert data["description"] == "Down payment"
    assert data["liquidity_category"] == "invested"
    assert data["sort_order"] == 3
    assert data["id"] > 0


def test_create_bucket_duplicate_name_returns_409(client: TestClient) -> None:
    create_bucket(client, name="Casa", liquidity_category="invested")

    response = client.post("/api/buckets", json={"name": "Casa", "liquidity_category": "liquid"})

    assert response.status_code == 409


def test_list_buckets_ordered_by_sort_order(client: TestClient) -> None:
    create_bucket(client, name="Zeta", liquidity_category="liquid", sort_order=10)
    create_bucket(client, name="Alpha", liquidity_category="invested", sort_order=9)

    names = [bucket["name"] for bucket in client.get("/api/buckets").json()]

    assert names.index("Alpha") < names.index("Zeta")


def test_get_bucket_not_found_returns_404(client: TestClient) -> None:
    assert client.get("/api/buckets/9999").status_code == 404


def test_update_bucket(client: TestClient) -> None:
    bucket = create_bucket(client, name="Casa", liquidity_category="invested")

    response = client.patch(
        f"/api/buckets/{bucket['id']}",
        json={"name": "Casa nuova", "liquidity_category": "reserve"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Casa nuova"
    assert data["liquidity_category"] == "reserve"


def test_update_bucket_duplicate_name_returns_409(client: TestClient) -> None:
    create_bucket(client, name="Casa", liquidity_category="invested")
    other = create_bucket(client, name="Auto", liquidity_category="invested")

    response = client.patch(f"/api/buckets/{other['id']}", json={"name": "Casa"})

    assert response.status_code == 409


def test_delete_empty_bucket_returns_204(client: TestClient) -> None:
    bucket = create_bucket(client, name="Casa", liquidity_category="invested")

    response = client.delete(f"/api/buckets/{bucket['id']}")

    assert response.status_code == 204
    assert client.get(f"/api/buckets/{bucket['id']}").status_code == 404


def test_delete_bucket_with_assets_returns_409(client: TestClient) -> None:
    bucket = create_bucket(client, name="Casa", liquidity_category="invested")
    create_asset(client, name="ETF", asset_class="equity_etf", bucket_id=bucket["id"])

    response = client.delete(f"/api/buckets/{bucket['id']}")

    assert response.status_code == 409
    assert client.get(f"/api/buckets/{bucket['id']}").status_code == 200


def test_delete_bucket_reassigns_assets(client: TestClient) -> None:
    target = client.get("/api/buckets").json()[0]
    source = create_bucket(client, name="Casa", liquidity_category="invested")
    asset = create_asset(client, name="ETF", asset_class="equity_etf", bucket_id=source["id"])

    response = client.delete(f"/api/buckets/{source['id']}?reassign_to={target['id']}")

    assert response.status_code == 204
    updated = client.get(f"/api/assets/{asset['id']}").json()
    assert updated["bucket_id"] == target["id"]
    assert updated["liquidity_category"] == "liquid"


def test_delete_bucket_reassign_to_itself_returns_422(client: TestClient) -> None:
    bucket = create_bucket(client, name="Casa", liquidity_category="invested")
    create_asset(client, name="ETF", asset_class="equity_etf", bucket_id=bucket["id"])

    response = client.delete(f"/api/buckets/{bucket['id']}?reassign_to={bucket['id']}")

    assert response.status_code == 422


def test_bucket_of_another_user_is_not_accessible(anon_client: TestClient) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    alice_bucket = anon_client.get("/api/buckets").json()[0]

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")

    assert anon_client.get(f"/api/buckets/{alice_bucket['id']}").status_code == 404
    assert (
        anon_client.patch(f"/api/buckets/{alice_bucket['id']}", json={"name": "stolen"}).status_code
        == 404
    )
    assert anon_client.delete(f"/api/buckets/{alice_bucket['id']}").status_code == 404


def test_create_asset_with_bucket_of_another_user_returns_404(
    anon_client: TestClient,
) -> None:
    create_user(anon_client, "alice@example.com")
    login(anon_client, "alice@example.com")
    alice_bucket = anon_client.get("/api/buckets").json()[0]

    create_user(anon_client, "bob@example.com")
    login(anon_client, "bob@example.com")

    response = anon_client.post(
        "/api/assets",
        json={
            "name": "Sneaky",
            "asset_class": "current_account",
            "bucket_id": alice_bucket["id"],
            "opening_balance": "0",
        },
    )

    assert response.status_code == 404
