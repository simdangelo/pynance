from fastapi import FastAPI

from pynance.api.routers import category, transaction

app = FastAPI()
app.include_router(category.router, prefix="/api/categories", tags=["categories"])
app.include_router(transaction.router, prefix="/api/transactions", tags=["transactions"])
