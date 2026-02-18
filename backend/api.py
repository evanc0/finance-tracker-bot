from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session

from database import init_db, User, Account, Transaction, TransactionType, Category

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

    class Config:
        from_attributes = True

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
    account_id: int
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
    categories = db.query(Category).filter(Category.user_id == telegram_id).all()

    return {
        "user": {
            "telegram_id": user.telegram_id,
            "currency": user.currency
        },
        "accounts": accounts,
        "transactions": transactions,
        "categories": categories
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

@app.put("/api/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, account_update: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account_update.name is not None:
        account.name = account_update.name
    if account_update.balance is not None:
        account.balance = account_update.balance

    db.commit()
    db.refresh(account)
    return account

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

@app.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(transaction_id: int, transaction_update: TransactionUpdate, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Если меняем сумму или тип, корректируем баланс счёта
    if transaction_update.amount is not None and transaction_update.amount != transaction.amount:
        old_amount = float(transaction.amount)
        new_amount = float(transaction_update.amount)
        diff = new_amount - old_amount

        account = db.query(Account).filter(Account.id == transaction.account_id).first()
        if account:
            if transaction.type == "expense":
                account.balance = float(account.balance) - diff
            else:
                account.balance = float(account.balance) + diff

    if transaction_update.account_id is not None and transaction_update.account_id != transaction.account_id:
        # Старый счёт
        old_account = db.query(Account).filter(Account.id == transaction.account_id).first()
        if old_account:
            if transaction.type == "expense":
                old_account.balance = float(old_account.balance) + float(transaction.amount)
            else:
                old_account.balance = float(old_account.balance) - float(transaction.amount)

        # Новый счёт
        new_account = db.query(Account).filter(Account.id == transaction_update.account_id).first()
        if new_account:
            if transaction.type == "expense":
                new_account.balance = float(new_account.balance) - float(transaction.amount)
            else:
                new_account.balance = float(new_account.balance) + float(transaction.amount)

        transaction.account_id = transaction_update.account_id

    if transaction_update.category is not None:
        transaction.category = transaction_update.category
    if transaction_update.description is not None:
        transaction.description = transaction_update.description
    if transaction_update.amount is not None:
        transaction.amount = transaction_update.amount

    db.commit()
    db.refresh(transaction)
    return transaction

@app.delete("/api/transactions/{transaction_id}")
async def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Возвращаем сумму на счёт
    account = db.query(Account).filter(Account.id == transaction.account_id).first()
    if account:
        if transaction.type == "expense":
            account.balance = float(account.balance) + float(transaction.amount)
        else:
            account.balance = float(account.balance) - float(transaction.amount)

    db.delete(transaction)
    db.commit()
    return {"message": "Transaction deleted"}

@app.get("/api/transactions/{user_id}", response_model=List[TransactionResponse])
async def get_transactions(user_id: int, db: Session = Depends(get_db)):
    return db.query(Transaction).filter(
        Transaction.user_id == user_id
    ).order_by(Transaction.created_at.desc()).all()

@app.post("/api/categories", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    db_category = Category(
        user_id=category.user_id,
        name=category.name,
        icon=category.icon,
        type=TransactionType(category.type)
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@app.get("/api/categories/{user_id}", response_model=List[CategoryResponse])
async def get_categories(user_id: int, db: Session = Depends(get_db)):
    return db.query(Category).filter(Category.user_id == user_id).all()

@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    db.delete(category)
    db.commit()
    return {"message": "Category deleted"}

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
