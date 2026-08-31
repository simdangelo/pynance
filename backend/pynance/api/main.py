from fastapi import FastAPI

from pynance.api.routers import asset, auth, category, recurring_template, transaction, transfer

app = FastAPI()
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(category.router, prefix="/api/categories", tags=["categories"])
app.include_router(transaction.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(
    recurring_template.router,
    prefix="/api/recurring-template",
    tags=["recurring-template"],
)
app.include_router(asset.router, prefix="/api/assets", tags=["assets"])
app.include_router(transfer.router, prefix="/api/transfers", tags=["transfers"])
