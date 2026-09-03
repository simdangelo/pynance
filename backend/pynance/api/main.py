import logging
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from pynance.api.routers import (
    asset,
    auth,
    category,
    import_data,
    recurring_template,
    static_assets,
    transaction,
    transfer,
)
from pynance.config import settings

logger = logging.getLogger(__name__)

SLOW_REQUEST_THRESHOLD_MS = 500


def _setup_logging() -> None:
    """Give pynance loggers a console handler so INFO/WARNING lines show up
    even though uvicorn only configures its own loggers (root stays WARNING)."""
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    pynance_logger = logging.getLogger("pynance")
    pynance_logger.addHandler(handler)
    pynance_logger.setLevel(logging.INFO)
    pynance_logger.propagate = False


_setup_logging()

app = FastAPI()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)


@app.middleware("http")
async def log_requests(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = str(uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.error(
            "%s %s -> 500 (%.1fms) request_id=%s",
            request.method,
            request.url.path,
            duration_ms,
            request_id,
            exc_info=True,
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    user_id = getattr(request.state, "user_id", None)
    log = logger.warning if duration_ms > SLOW_REQUEST_THRESHOLD_MS else logger.info
    log(
        "%s %s -> %s (%.1fms) request_id=%s user_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
        user_id,
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    user_id = getattr(request.state, "user_id", None)
    logger.error(
        "Unhandled exception on %s %s request_id=%s user_id=%s",
        request.method,
        request.url.path,
        request_id,
        user_id,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={"X-Request-ID": request_id},
    )


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(import_data.router, prefix="/api/import", tags=["import"])
app.include_router(category.router, prefix="/api/categories", tags=["categories"])
app.include_router(transaction.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(
    recurring_template.router,
    prefix="/api/recurring-template",
    tags=["recurring-template"],
)
app.include_router(asset.router, prefix="/api/assets", tags=["assets"])
app.include_router(transfer.router, prefix="/api/transfers", tags=["transfers"])

# Serve the built frontend (single origin) when present; a no-op in dev.
app.include_router(static_assets.router)
