import logging
import time
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

from pynance.api.routers import (
    asset,
    auth,
    category,
    import_data,
    recurring_template,
    transaction,
    transfer,
)
from pynance.config import settings

logger = logging.getLogger(__name__)

SLOW_REQUEST_THRESHOLD_MS = 500

app = FastAPI()
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)


@app.middleware("http")
async def log_requests(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = str(uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    log = logger.warning if duration_ms > SLOW_REQUEST_THRESHOLD_MS else logger.info
    log(
        "%s %s -> %s (%.1fms) request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response


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
