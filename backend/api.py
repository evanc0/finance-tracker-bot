from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session

from database import init_db, User, Account, Transaction, TransactionType

app = FastAPI(title="Finance Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SessionLocal = init_db()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class AccountCreate(BaseModel):
    user_id: int
    name: str
    balance: Decimal = Decimal("0.00")

class TransactionCreate(BaseModel):
    user_id: int
    account_id: int
    type: str
    amount: Decimal
    category: str
    description: Optional[str] = ""

class AccountResponse(BaseModel):
    id: int
    name: str
    balance: Decimal
    
    class Config:
        from_attributes = True

class TransactionResponse(BaseModel):
    id: int
    type: str
    amount: Decimal
    category: str
    description: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

@app.get("/api/user/{telegram_id}")
async def get_user_data(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        # Создаём нового пользователя с основным счётом
        user = User(telegram_id=telegram_id)
        db.add(user)
        
        default_account = Account(user_id=telegram_id, name="Основной", balance=0.00)
        db.add(default_account)
        db.commit()
        db.refresh(user)

    accounts = db.query(Account).filter(Account.user_id == telegram_id).all()
    transactions = db.query(Transaction).filter(
        Transaction.user_id == telegram_id
    ).order_by(Transaction.created_at.desc()).limit(50).all()

    return {
        "user": {
            "telegram_id": user.telegram_id,
            "currency": user.currency
        },
        "accounts": accounts,
        "transactions": transactions
    }

@app.post("/api/accounts", response_model=AccountResponse)
async def create_account(account: AccountCreate, db: Session = Depends(get_db)):
    db_account = Account(
        user_id=account.user_id,
        name=account.name,
        balance=account.balance
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account

@app.get("/api/accounts/{user_id}", response_model=List[AccountResponse])
async def get_accounts(user_id: int, db: Session = Depends(get_db)):
    return db.query(Account).filter(Account.user_id == user_id).all()

@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    db.delete(account)
    db.commit()
    return {"message": "Account deleted"}

@app.post("/api/transactions", response_model=TransactionResponse)
async def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(
        Account.id == transaction.account_id,
        Account.user_id == transaction.user_id
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    db_transaction = Transaction(
        user_id=transaction.user_id,
        account_id=transaction.account_id,
        type=TransactionType(transaction.type),
        amount=transaction.amount,
        category=transaction.category,
        description=transaction.description
    )

    if transaction.type == "expense":
        account.balance -= transaction.amount
    else:
        account.balance += transaction.amount

    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@app.get("/api/stats/{user_id}")
async def get_stats(user_id: int, db: Session = Depends(get_db)):
    accounts = db.query(Account).filter(Account.user_id == user_id).all()
    transactions = db.query(Transaction).filter(Transaction.user_id == user_id).all()

    total_balance = sum(acc.balance for acc in accounts)
    total_income = sum(t.amount for t in transactions if t.type == TransactionType.INCOME)
    total_expense = sum(t.amount for t in transactions if t.type == TransactionType.EXPENSE)

    return {
        "total_balance": total_balance,
        "total_income": total_income,
        "total_expense": total_expense,
        "accounts_count": len(accounts),
        "transactions_count": len(transactions)
    }

if __name__ == "__main__":
    import os
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
