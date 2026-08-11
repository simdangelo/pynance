from fastapi import FastAPI

from pynance.api.routers import category, recurring_template, transaction

app = FastAPI()
app.include_router(category.router, prefix="/api/categories", tags=["categories"])
app.include_router(transaction.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(
    recurring_template.router,
    prefix="/api/recurring-template",
    tags=["recurring-template"],
)
