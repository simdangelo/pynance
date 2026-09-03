from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend-dist"

router = APIRouter()

if FRONTEND_DIST.is_dir():
    router.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @router.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")

    @router.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        candidate = FRONTEND_DIST / path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
