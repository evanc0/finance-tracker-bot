from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

import database as store
from database import init_db

app = FastAPI(title="Finance Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # Прогреваем подключение к Google Таблице и создаём недостающие листы.
    init_db()

class AccountCreate(BaseModel):
    user_id: int
    name: str
    balance: Decimal = Decimal("0.00")

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    balance: Optional[Decimal] = None

class TransactionCreate(BaseModel):
    user_id: int
    account_id: int
    type: str
    amount: Decimal
    category: str
    description: Optional[str] = ""

class TransactionUpdate(BaseModel):
    amount: Optional[Decimal] = None
    category: Optional[str] = None
    description: Optional[str] = None
    account_id: Optional[int] = None

class CategoryCreate(BaseModel):
    user_id: int
    name: str
    icon: str = '📝'
    type: str

class CategoryResponse(BaseModel):
    id: int
    name: str
    icon: str
    type: str

class AccountResponse(BaseModel):
    id: int
    name: str
    balance: Decimal

class TransactionResponse(BaseModel):
    id: int
    type: str
    amount: Decimal
    category: str
    description: Optional[str]
    account_id: int
    created_at: datetime

@app.get("/api/user/{telegram_id}")
async def get_user_data(telegram_id: int):
    return store.get_user_data(telegram_id)

@app.post("/api/accounts", response_model=AccountResponse)
async def create_account(account: AccountCreate):
    return store.create_account(
        user_id=account.user_id,
        name=account.name,
        balance=account.balance,
    )

@app.put("/api/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, account_update: AccountUpdate):
    account = store.update_account(
        account_id=account_id,
        name=account_update.name,
        balance=account_update.balance,
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account

@app.get("/api/accounts/{user_id}", response_model=List[AccountResponse])
async def get_accounts(user_id: int):
    return store.list_accounts(user_id)

@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int):
    if not store.delete_account(account_id):
        raise HTTPException(status_code=404, detail="Account not found")
    return {"message": "Account deleted"}

@app.post("/api/transactions", response_model=TransactionResponse)
async def create_transaction(transaction: TransactionCreate):
    try:
        created = store.create_transaction(
            user_id=transaction.user_id,
            account_id=transaction.account_id,
            transaction_type=transaction.type,
            amount=transaction.amount,
            category=transaction.category,
            description=transaction.description or "",
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if created is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return created

@app.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(transaction_id: int, transaction_update: TransactionUpdate):
    transaction = store.update_transaction(
        transaction_id=transaction_id,
        amount=transaction_update.amount,
        category=transaction_update.category,
        description=transaction_update.description,
        account_id=transaction_update.account_id,
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction

@app.delete("/api/transactions/{transaction_id}")
async def delete_transaction(transaction_id: int):
    if not store.delete_transaction(transaction_id):
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted"}

@app.get("/api/transactions/{user_id}", response_model=List[TransactionResponse])
async def get_transactions(user_id: int):
    return store.list_transactions(user_id)

@app.post("/api/categories", response_model=CategoryResponse)
async def create_category(category: CategoryCreate):
    return store.create_category(
        user_id=category.user_id,
        name=category.name,
        icon=category.icon,
        category_type=category.type,
    )

@app.get("/api/categories/{user_id}", response_model=List[CategoryResponse])
async def get_categories(user_id: int):
    return store.list_categories(user_id)

@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int):
    if not store.delete_category(category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

@app.get("/api/stats/{user_id}")
async def get_stats(user_id: int):
    return store.get_stats(user_id)

if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
