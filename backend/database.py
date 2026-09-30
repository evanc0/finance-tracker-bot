"""Слой доступа к данным поверх Google Таблиц (gspread).

Раньше здесь была модель SQLAlchemy. Теперь все данные лежат в нативной
Google Таблице: по одному листу на сущность (users, accounts, categories,
transactions). Таблица выступает в роли базы данных, а доступ к ней идёт
через сервисный аккаунт Google.

Переменные окружения:
    GOOGLE_CREDENTIALS             JSON-ключ сервисного аккаунта (строкой или base64)
    GOOGLE_APPLICATION_CREDENTIALS путь к файлу ключа (альтернатива, удобно локально)
    SPREADSHEET_ID                 ID таблицы из её URL
    SPREADSHEET_URL                полный URL таблицы (альтернатива SPREADSHEET_ID)
"""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

import gspread
from google.oauth2.service_account import Credentials
from gspread.utils import rowcol_to_a1

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv не установлен — читаем только реальные переменные окружения
    pass

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Порядок колонок по умолчанию. Если в таблице колонки переставлены,
# запись всё равно идёт по фактическим заголовкам листа.
SHEET_HEADERS: Dict[str, List[str]] = {
    "users": ["telegram_id", "currency", "created_at"],
    "accounts": ["id", "user_id", "name", "balance", "created_at"],
    "categories": ["id", "user_id", "name", "icon", "type", "created_at"],
    "transactions": [
        "id",
        "user_id",
        "account_id",
        "type",
        "amount",
        "category",
        "description",
        "created_at",
    ],
}

INCOME = "income"
EXPENSE = "expense"

_two_places = Decimal("0.01")

_lock = threading.RLock()
_client: Optional[gspread.Client] = None
_spreadsheet: Optional[gspread.Spreadsheet] = None
_worksheets: Dict[str, gspread.Worksheet] = {}
_headers: Dict[str, List[str]] = {}


# ---------------------------------------------------------------------------
# Подключение к Google Sheets
# ---------------------------------------------------------------------------

def _read_credentials() -> Credentials:
    raw = os.environ.get("GOOGLE_CREDENTIALS")
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

    if raw:
        raw = raw.strip()
        try:
            info = json.loads(raw)
        except json.JSONDecodeError:
            info = json.loads(base64.b64decode(raw).decode("utf-8"))
        return Credentials.from_service_account_info(info, scopes=SCOPES)

    if path:
        return Credentials.from_service_account_file(path, scopes=SCOPES)

    raise RuntimeError(
        "Не заданы GOOGLE_CREDENTIALS (JSON сервисного аккаунта строкой) "
        "или GOOGLE_APPLICATION_CREDENTIALS (путь к файлу ключа)."
    )


def _get_client() -> gspread.Client:
    global _client
    if _client is None:
        _client = gspread.authorize(_read_credentials())
    return _client


def _get_spreadsheet() -> gspread.Spreadsheet:
    global _spreadsheet
    if _spreadsheet is None:
        client = _get_client()
        url = os.environ.get("SPREADSHEET_URL")
        key = os.environ.get("SPREADSHEET_ID")
        if url:
            _spreadsheet = client.open_by_url(url)
        elif key:
            _spreadsheet = client.open_by_key(key)
        else:
            raise RuntimeError("Не заданы SPREADSHEET_ID или SPREADSHEET_URL.")
        logger.info("Подключено к Google Таблице: %s", _spreadsheet.title)
    return _spreadsheet


def init_db(database_url: str = None):
    """Проверяет подключение и создаёт недостающие листы с заголовками.

    Аргумент database_url оставлен для совместимости и игнорируется.
    """
    with _lock:
        for table in SHEET_HEADERS:
            _worksheet(table)
    return True


def _worksheet(table: str) -> gspread.Worksheet:
    if table in _worksheets:
        return _worksheets[table]

    spreadsheet = _get_spreadsheet()
    headers = SHEET_HEADERS[table]
    try:
        worksheet = spreadsheet.worksheet(table)
    except gspread.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(
            title=table, rows=1000, cols=max(len(headers), 8)
        )
        worksheet.append_row(headers, value_input_option="USER_ENTERED")
    else:
        if not worksheet.row_values(1):
            worksheet.append_row(headers, value_input_option="USER_ENTERED")

    _worksheets[table] = worksheet
    return worksheet


def _header(table: str) -> List[str]:
    if table not in _headers:
        first_row = _worksheet(table).row_values(1)
        _headers[table] = first_row or list(SHEET_HEADERS[table])
    return _headers[table]


# ---------------------------------------------------------------------------
# Приведение типов
# ---------------------------------------------------------------------------

def _to_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    text = str(value).strip()
    if text == "":
        return default
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return default


def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))

    text = str(value).strip().replace("\xa0", "").replace(" ", "")
    if text == "":
        return default

    # Google Таблица может отдать число в локали таблицы: "1 234,56" или "1,234.56".
    # Определяем десятичный разделитель по последнему из встреченных знаков.
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        if text.count(",") == 1 and len(text.split(",")[-1]) <= 2:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")

    if text.count(".") > 1:
        head, _, tail = text.rpartition(".")
        text = head.replace(".", "") + "." + tail

    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return default


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if text:
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
        for fmt in (
            "%Y-%m-%d %H:%M:%S",
            "%d.%m.%Y %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
            "%m/%d/%Y %H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
    return datetime.utcnow()


def _norm_decimal(value: Any) -> Decimal:
    return _to_decimal(value).quantize(_two_places, rounding=ROUND_HALF_UP)


def _format_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return format(value.quantize(_two_places, rounding=ROUND_HALF_UP), "f")
    if isinstance(value, float):
        return format(_norm_decimal(value), "f")
    return str(value)


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Низкоуровневые операции с листами
# ---------------------------------------------------------------------------

def _read_all(table: str) -> List[Dict[str, Any]]:
    values = _worksheet(table).get_all_values()
    if not values:
        return []

    header = _header(table)
    records: List[Dict[str, Any]] = []
    for index, row in enumerate(values[1:], start=2):
        if not any(str(cell).strip() for cell in row):
            continue
        record = {
            name: (row[position] if position < len(row) else "")
            for position, name in enumerate(header)
        }
        record["_row"] = index
        records.append(record)
    return records


def _matches(cell: Any, expected: Any) -> bool:
    if expected is None:
        return str(cell).strip() == ""
    if isinstance(expected, bool):
        return str(cell).strip() == str(expected)
    if isinstance(expected, int):
        return _to_int(cell) == expected
    return str(cell) == str(expected)


def _filter(table: str, **criteria: Any) -> List[Dict[str, Any]]:
    return [
        record
        for record in _read_all(table)
        if all(_matches(record.get(key), value) for key, value in criteria.items())
    ]


def _find(table: str, **criteria: Any) -> Optional[Dict[str, Any]]:
    matches = _filter(table, **criteria)
    return matches[0] if matches else None


def _row_values(table: str, record: Dict[str, Any]) -> List[str]:
    return [_format_value(record.get(name, "")) for name in _header(table)]


def _next_id(table: str) -> int:
    ids = [i for i in (_to_int(record.get("id")) for record in _read_all(table)) if i is not None]
    return max(ids) + 1 if ids else 1


def _append(table: str, record: Dict[str, Any]) -> Dict[str, Any]:
    _worksheet(table).append_row(
        _row_values(table, record), value_input_option="USER_ENTERED"
    )
    return record


def _write_row(table: str, row: int, record: Dict[str, Any]) -> None:
    values = _row_values(table, record)
    if not values:
        return
    end_cell = rowcol_to_a1(row, len(values))
    _worksheet(table).batch_update(
        [{"range": f"A{row}:{end_cell}", "values": [values]}]
    )


def _delete_row(table: str, row: int) -> None:
    _worksheet(table).delete_rows(row)


# ---------------------------------------------------------------------------
# Публичные представления записей
# ---------------------------------------------------------------------------

def _account_public(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": _to_int(record.get("id")),
        "name": record.get("name", ""),
        "balance": _to_decimal(record.get("balance")),
    }


def _category_public(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": _to_int(record.get("id")),
        "name": record.get("name", ""),
        "icon": record.get("icon") or "📝",
        "type": record.get("type", ""),
    }


def _transaction_public(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": _to_int(record.get("id")),
        "type": record.get("type", ""),
        "amount": _to_decimal(record.get("amount")),
        "category": record.get("category", ""),
        "description": record.get("description", "") or "",
        "account_id": _to_int(record.get("account_id")),
        "created_at": _to_datetime(record.get("created_at")),
    }


# ---------------------------------------------------------------------------
# Пользователи
# ---------------------------------------------------------------------------

def get_or_create_user(telegram_id: int) -> Dict[str, Any]:
    with _lock:
        record = _find("users", telegram_id=telegram_id)
        if record is None:
            _append(
                "users",
                {
                    "telegram_id": telegram_id,
                    "currency": "RUB",
                    "created_at": _now(),
                },
            )
            _append(
                "accounts",
                {
                    "id": _next_id("accounts"),
                    "user_id": telegram_id,
                    "name": "Основной",
                    "balance": Decimal("0.00"),
                    "created_at": _now(),
                },
            )
            record = _find("users", telegram_id=telegram_id)
        return {
            "telegram_id": _to_int(record.get("telegram_id")),
            "currency": record.get("currency") or "RUB",
        }


def get_user_data(telegram_id: int) -> Dict[str, Any]:
    user = get_or_create_user(telegram_id)
    return {
        "user": user,
        "accounts": list_accounts(telegram_id),
        "transactions": list_transactions(telegram_id, limit=50),
        "categories": list_categories(telegram_id),
    }


# ---------------------------------------------------------------------------
# Счета
# ---------------------------------------------------------------------------

def list_accounts(user_id: int) -> List[Dict[str, Any]]:
    return [_account_public(record) for record in _filter("accounts", user_id=user_id)]


def create_account(user_id: int, name: str, balance: Any = Decimal("0.00")) -> Dict[str, Any]:
    with _lock:
        record = {
            "id": _next_id("accounts"),
            "user_id": user_id,
            "name": name,
            "balance": _norm_decimal(balance),
            "created_at": _now(),
        }
        _append("accounts", record)
        return _account_public(record)


def update_account(
    account_id: int,
    name: Optional[str] = None,
    balance: Any = None,
) -> Optional[Dict[str, Any]]:
    with _lock:
        record = _find("accounts", id=account_id)
        if record is None:
            return None
        if name is not None:
            record["name"] = name
        if balance is not None:
            record["balance"] = _norm_decimal(balance)
        _write_row("accounts", record["_row"], record)
        return _account_public(record)


def delete_account(account_id: int) -> bool:
    with _lock:
        record = _find("accounts", id=account_id)
        if record is None:
            return False

        transactions = _filter("transactions", account_id=account_id)
        for transaction in sorted(transactions, key=lambda r: r["_row"], reverse=True):
            _delete_row("transactions", transaction["_row"])

        _delete_row("accounts", record["_row"])
        return True


# ---------------------------------------------------------------------------
# Категории
# ---------------------------------------------------------------------------

def list_categories(user_id: int) -> List[Dict[str, Any]]:
    return [_category_public(record) for record in _filter("categories", user_id=user_id)]


def create_category(
    user_id: int,
    name: str,
    icon: str = "📝",
    category_type: str = EXPENSE,
) -> Dict[str, Any]:
    with _lock:
        record = {
            "id": _next_id("categories"),
            "user_id": user_id,
            "name": name,
            "icon": icon or "📝",
            "type": category_type,
            "created_at": _now(),
        }
        _append("categories", record)
        return _category_public(record)


def delete_category(category_id: int) -> bool:
    with _lock:
        record = _find("categories", id=category_id)
        if record is None:
            return False
        _delete_row("categories", record["_row"])
        return True


# ---------------------------------------------------------------------------
# Транзакции
# ---------------------------------------------------------------------------

def list_transactions(user_id: int, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    records = _filter("transactions", user_id=user_id)
    records.sort(
        key=lambda r: (_to_datetime(r.get("created_at")), _to_int(r.get("id"), 0)),
        reverse=True,
    )
    if limit is not None:
        records = records[:limit]
    return [_transaction_public(record) for record in records]


def _adjust_balance(record: Dict[str, Any], delta: Decimal) -> None:
    record["balance"] = _norm_decimal(_to_decimal(record.get("balance")) + delta)
    _write_row("accounts", record["_row"], record)


def create_transaction(
    user_id: int,
    account_id: int,
    transaction_type: str,
    amount: Any,
    category: str,
    description: str = "",
) -> Optional[Dict[str, Any]]:
    if transaction_type not in (INCOME, EXPENSE):
        raise ValueError(f"Неизвестный тип операции: {transaction_type}")

    with _lock:
        account = _find("accounts", id=account_id, user_id=user_id)
        if account is None:
            return None

        value = _norm_decimal(amount)
        record = {
            "id": _next_id("transactions"),
            "user_id": user_id,
            "account_id": account_id,
            "type": transaction_type,
            "amount": value,
            "category": category,
            "description": description or "",
            "created_at": _now(),
        }
        _append("transactions", record)

        delta = -value if transaction_type == EXPENSE else value
        _adjust_balance(account, delta)
        return _transaction_public(record)


def update_transaction(
    transaction_id: int,
    amount: Any = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    account_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    with _lock:
        record = _find("transactions", id=transaction_id)
        if record is None:
            return None

        transaction_type = str(record.get("type"))
        sign = Decimal("-1") if transaction_type == EXPENSE else Decimal("1")
        old_account_id = _to_int(record.get("account_id"))

        if amount is not None and _norm_decimal(amount) != _to_decimal(record.get("amount")):
            old_value = _norm_decimal(record.get("amount"))
            new_value = _norm_decimal(amount)
            diff = new_value - old_value
            old_account = _find("accounts", id=old_account_id)
            if old_account is not None:
                _adjust_balance(old_account, sign * diff)
            record["amount"] = new_value

        if account_id is not None and _to_int(account_id) != old_account_id:
            current_value = _norm_decimal(record.get("amount"))
            old_account = _find("accounts", id=old_account_id)
            if old_account is not None:
                _adjust_balance(old_account, -sign * current_value)

            new_account = _find("accounts", id=_to_int(account_id))
            if new_account is not None:
                _adjust_balance(new_account, sign * current_value)

            record["account_id"] = _to_int(account_id)

        if category is not None:
            record["category"] = category
        if description is not None:
            record["description"] = description

        _write_row("transactions", record["_row"], record)
        return _transaction_public(record)


def delete_transaction(transaction_id: int) -> bool:
    with _lock:
        record = _find("transactions", id=transaction_id)
        if record is None:
            return False

        sign = Decimal("-1") if str(record.get("type")) == EXPENSE else Decimal("1")
        account = _find("accounts", id=_to_int(record.get("account_id")))
        if account is not None:
            _adjust_balance(account, -sign * _norm_decimal(record.get("amount")))

        _delete_row("transactions", record["_row"])
        return True


# ---------------------------------------------------------------------------
# Статистика
# ---------------------------------------------------------------------------

def get_stats(user_id: int) -> Dict[str, Any]:
    accounts = list_accounts(user_id)
    transactions = list_transactions(user_id)

    total_balance = sum((account["balance"] for account in accounts), Decimal("0"))
    total_income = sum(
        (t["amount"] for t in transactions if t["type"] == INCOME), Decimal("0")
    )
    total_expense = sum(
        (t["amount"] for t in transactions if t["type"] == EXPENSE), Decimal("0")
    )

    return {
        "total_balance": total_balance,
        "total_income": total_income,
        "total_expense": total_expense,
        "accounts_count": len(accounts),
        "transactions_count": len(transactions),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()
    spreadsheet = _get_spreadsheet()
    print(f"Таблица: {spreadsheet.title} ({spreadsheet.id})")
    for table_name in SHEET_HEADERS:
        print(f"  {table_name}: {len(_read_all(table_name))} строк")
