from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, DateTime, Enum, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.types import Numeric
from datetime import datetime
import enum
from decimal import Decimal
import os

Base = declarative_base()

class TransactionType(enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"

class User(Base):
    __tablename__ = 'users'

    telegram_id = Column(Integer, primary_key=True)
    currency = Column(String(3), default='RUB')
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")

class Account(Base):
    __tablename__ = 'accounts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.telegram_id'))
    name = Column(String(50), nullable=False)
    balance = Column(Numeric(10, 2), default=0.00)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")

class Category(Base):
    __tablename__ = 'categories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.telegram_id'), nullable=False)
    name = Column(String(50), nullable=False)
    icon = Column(String(10), default='📝')
    type = Column(Enum(TransactionType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="categories")

class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.telegram_id'))
    account_id = Column(Integer, ForeignKey('accounts.id'))
    type = Column(Enum(TransactionType), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    category = Column(String(50), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")

def init_db(database_url: str = None):
    # Получаем URL из переменных окружения или используем SQLite по умолчанию
    if database_url is None:
        database_url = os.environ.get("DATABASE_URL", "sqlite:///./finance_tracker.db")

    # Настройки для PostgreSQL
    if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
        engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=300
        )
    else:
        # Настройки для SQLite
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False}
        )

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal
