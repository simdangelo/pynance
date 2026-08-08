from datetime import datetime

from pydantic import BaseModel, ConfigDict

from pynance.models.types import TransactionType


# 1. Schema base: i campi "editabili" condivisi tra create e response
class CategoryBase(BaseModel):
    name: str
    transaction_type: TransactionType


# 2. Schema per la CREAZIONE (input POST)
#    -> eredita da Base, non serve altro perché id/created_at li genera il DB
class CategoryCreate(CategoryBase):
    pass


# 3. Schema per la MODIFICA (input PATCH/PUT)
#    -> tutti i campi opzionali: l'utente può aggiornare solo alcuni campi
class CategoryUpdate(BaseModel):
    name: str | None = None
    transaction_type: TransactionType | None = None


# 4. Schema per la RISPOSTA (output, es. GET o dopo la create)
#    -> include i campi generati dal server
class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
