import json
from io import BytesIO
from typing import Any, cast

import openpyxl
from fastapi.testclient import TestClient
from httpx import Response

from tests.conftest import create_asset, create_category, create_transaction

CSV_HEADERS = "Data;Descrizione;Importo;Categoria"


def upload_preview(
    client: TestClient,
    content: bytes,
    filename: str = "movimenti.csv",
    **form: Any,
) -> dict[str, Any]:
    response = client.post(
        "/api/import/preview",
        files={"file": (filename, content, "text/csv")},
        data={key: value for key, value in form.items() if value is not None},
    )
    assert response.status_code == 200, response.text
    return cast("dict[str, Any]", response.json())


def commit_import(
    client: TestClient,
    content: bytes,
    *,
    asset_id: int,
    selected_indexes: list[int],
    row_categories: list[dict[str, int]] | None = None,
    filename: str = "movimenti.csv",
    **form: Any,
) -> Response:
    data: dict[str, Any] = {
        "asset_id": str(asset_id),
        "selected_indexes": json.dumps(selected_indexes),
        "row_categories": json.dumps(row_categories or []),
    }
    data.update({key: value for key, value in form.items() if value is not None})
    response: Response = client.post(
        "/api/import/commit",
        files={"file": (filename, content, "text/csv")},
        data=data,
    )
    return response


def make_xlsx(sheets: dict[str, list[list[Any]]]) -> bytes:
    workbook = openpyxl.Workbook()
    default = workbook.active
    if default is not None:
        workbook.remove(default)
    for name, rows in sheets.items():
        sheet = workbook.create_sheet(title=name)
        for row in rows:
            sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_preview_suggests_mapping_and_parses_rows(client: TestClient) -> None:
    content = (
        f"{CSV_HEADERS}\n"
        "01/03/2026;Spesa Coop;-42,50;Spesa\n"
        "27/03/2026;Stipendio;2350,00;Stipendio\n"
    ).encode()

    data = upload_preview(client, content)

    assert data["delimiter"] == ";"
    assert data["suggested_mapping"]["date"] == "Data"
    assert data["suggested_mapping"]["description"] == "Descrizione"
    assert data["suggested_mapping"]["amount"] == "Importo"
    assert data["suggested_mapping"]["category"] == "Categoria"
    assert data["summary"] == {"total": 2, "ok": 2, "invalid": 0, "duplicate": 0}

    first, second = data["rows"]
    assert first["date"] == "2026-03-01"
    assert first["amount"] == "42.50"
    assert first["direction"] == "expense"
    assert first["description"] == "Spesa Coop"
    assert second["date"] == "2026-03-27"
    assert second["direction"] == "income"


def test_preview_marks_invalid_rows_with_reason(client: TestClient) -> None:
    content = (
        f"{CSV_HEADERS}\nnot-a-date;Spesa Coop;-42,50;Spesa\n02/03/2026;Spesa Esselunga;abc;Spesa\n"
    ).encode()

    data = upload_preview(client, content)

    assert data["summary"]["invalid"] == 2
    assert all(row["status"] == "invalid" for row in data["rows"])
    assert all(row["reason"] for row in data["rows"])


def test_preview_marks_duplicates_without_writing(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    groceries = create_category(client, "Spesa", "expense")
    create_transaction(
        client,
        amount="42.50",
        category_id=groceries["id"],
        description="Spesa Coop",
        occurred_on="2026-03-01",
        asset_id=asset["id"],
    )

    content = (
        f"{CSV_HEADERS}\n"
        "01/03/2026;Spesa Coop;-42,50;Spesa\n"
        "02/03/2026;Spesa Esselunga;-30,00;Spesa\n"
    ).encode()

    data = upload_preview(client, content, asset_id=asset["id"])

    duplicate, fresh = data["rows"]
    assert duplicate["status"] == "duplicate"
    assert duplicate["duplicate_of"] is not None
    assert fresh["status"] == "ok"
    assert data["summary"]["duplicate"] == 1
    # preview must not write anything
    assert len(client.get("/api/transactions").json()) == 1


def test_preview_supports_type_column(client: TestClient) -> None:
    content = (
        b"Date,Description,Type,Amount\n"
        b"2026-03-01,Coffee,Expense,3.50\n"
        b"2026-03-02,Salary,Income,2000.00\n"
    )

    data = upload_preview(client, content)

    assert data["suggested_mapping"]["type"] == "Type"
    assert [row["direction"] for row in data["rows"]] == ["expense", "income"]
    assert [row["amount"] for row in data["rows"]] == ["3.50", "2000.00"]


def test_preview_supports_debit_and_credit_columns(client: TestClient) -> None:
    content = b"Date,Description,Dare,Avere\n2026-03-01,Rent,780.00,\n2026-03-02,Salary,,2000.00\n"
    mapping = {
        "date": "Date",
        "description": "Description",
        "debit": "Dare",
        "credit": "Avere",
    }

    data = upload_preview(client, content, mapping=json.dumps(mapping))

    rows = data["rows"]
    assert [row["direction"] for row in rows] == ["expense", "income"]
    assert [row["amount"] for row in rows] == ["780.00", "2000.00"]


def test_preview_does_not_suggest_debit_and_credit_columns(client: TestClient) -> None:
    content = b"Date,Description,Dare,Avere\n2026-03-01,Rent,780.00,\n"

    data = upload_preview(client, content)

    assert data["suggested_mapping"]["debit"] is None
    assert data["suggested_mapping"]["credit"] is None


def test_preview_honours_date_format_override(client: TestClient) -> None:
    content = f"{CSV_HEADERS}\n03/01/2026;Spesa;-10,00;Spesa\n".encode()

    european = upload_preview(client, content)
    american = upload_preview(client, content, date_format="mdy")

    assert european["rows"][0]["date"] == "2026-01-03"
    assert american["rows"][0]["date"] == "2026-03-01"


def test_preview_lists_excel_sheets_and_parses_selected_sheet(client: TestClient) -> None:
    content = make_xlsx(
        {
            "Movimenti": [
                ["Data", "Descrizione", "Importo", "Categoria"],
                ["01/03/2026", "Spesa Coop", -42.5, "Spesa"],
            ],
            "Altro": [
                ["Data", "Descrizione", "Importo", "Categoria"],
                ["02/03/2026", "Spesa Lidl", -20.0, "Spesa"],
            ],
        }
    )

    data = upload_preview(client, content, filename="movimenti.xlsx")

    assert data["sheets"] == ["Movimenti", "Altro"]
    assert data["rows"][0]["description"] == "Spesa Coop"

    other = upload_preview(client, content, filename="movimenti.xlsx", sheet="Altro")

    assert other["rows"][0]["description"] == "Spesa Lidl"


def test_commit_imports_only_selected_rows(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    groceries = create_category(client, "Spesa", "expense")
    content = (
        f"{CSV_HEADERS}\n"
        "01/03/2026;Spesa Coop;-42,50;Spesa\n"
        "02/03/2026;Spesa Lidl;-20,00;Spesa\n"
        "03/03/2026;Spesa Conad;-15,00;Spesa\n"
    ).encode()
    preview = upload_preview(client, content, asset_id=asset["id"])

    response = commit_import(
        client,
        content,
        asset_id=asset["id"],
        selected_indexes=[preview["rows"][0]["index"], preview["rows"][2]["index"]],
        row_categories=[
            {"index": preview["rows"][0]["index"], "category_id": groceries["id"]},
            {"index": preview["rows"][2]["index"], "category_id": groceries["id"]},
        ],
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["imported"] == 2
    assert len(result["transaction_ids"]) == 2
    transactions = client.get("/api/transactions?year=2026&month=3").json()
    assert [t["description"] for t in transactions] == ["Spesa Conad", "Spesa Coop"]


def test_commit_uses_per_row_categories(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    groceries = create_category(client, "Spesa", "expense")
    transport = create_category(client, "Trasporti", "expense")
    content = (
        f"{CSV_HEADERS}\n01/03/2026;Spesa Coop;-42,50;Spesa\n02/03/2026;Metro;-2,00;Trasporti\n"
    ).encode()
    preview = upload_preview(client, content, asset_id=asset["id"])

    response = commit_import(
        client,
        content,
        asset_id=asset["id"],
        selected_indexes=[row["index"] for row in preview["rows"]],
        row_categories=[
            {"index": 0, "category_id": groceries["id"]},
            {"index": 1, "category_id": transport["id"]},
        ],
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 2
    transactions = client.get("/api/transactions?year=2026&month=3").json()
    by_description = {t["description"]: t["category_id"] for t in transactions}
    assert by_description["Spesa Coop"] == groceries["id"]
    assert by_description["Metro"] == transport["id"]


def test_commit_skips_selected_rows_without_a_category(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    content = f"{CSV_HEADERS}\n01/03/2026;Spesa Coop;-42,50;Spesa\n".encode()
    preview = upload_preview(client, content, asset_id=asset["id"])

    response = commit_import(
        client,
        content,
        asset_id=asset["id"],
        selected_indexes=[preview["rows"][0]["index"]],
        row_categories=[],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["imported"] == 0
    assert result["skipped"] == 1


def test_commit_skips_rows_whose_category_type_conflicts(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    salary = create_category(client, "Stipendio", "income")
    content = f"{CSV_HEADERS}\n01/03/2026;Spesa Coop;-42,50;Spesa\n".encode()
    preview = upload_preview(client, content, asset_id=asset["id"])

    response = commit_import(
        client,
        content,
        asset_id=asset["id"],
        selected_indexes=[row["index"] for row in preview["rows"]],
        row_categories=[{"index": 0, "category_id": salary["id"]}],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["imported"] == 0
    assert result["skipped"] == 1


def test_commit_requires_an_asset(client: TestClient) -> None:
    content = f"{CSV_HEADERS}\n01/03/2026;Spesa Coop;-42,50;Spesa\n".encode()

    response = client.post(
        "/api/import/commit",
        files={"file": ("movimenti.csv", content, "text/csv")},
        data={"selected_indexes": "[]", "row_categories": "[]"},
    )

    assert response.status_code == 422


def test_commit_ids_can_be_undone_with_bulk_delete(client: TestClient) -> None:
    asset = create_asset(client, name="Checking", asset_class="current_account")
    groceries = create_category(client, "Spesa", "expense")
    content = f"{CSV_HEADERS}\n01/03/2026;Spesa Coop;-42,50;Spesa\n".encode()
    preview = upload_preview(client, content, asset_id=asset["id"])
    result = commit_import(
        client,
        content,
        asset_id=asset["id"],
        selected_indexes=[row["index"] for row in preview["rows"]],
        row_categories=[{"index": 0, "category_id": groceries["id"]}],
    ).json()

    response = client.post("/api/transactions/bulk-delete", json={"ids": result["transaction_ids"]})

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert client.get("/api/transactions?year=2026&month=3").json() == []
