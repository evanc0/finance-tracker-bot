import os
import json
import logging
from datetime import datetime
from decimal import Decimal

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters
from telegram.constants import ParseMode

from database import (
    init_db,
    get_or_create_user,
    list_accounts,
    list_transactions,
    create_account,
    create_transaction,
    get_stats,
)
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")

def _account_name(telegram_id: int, account_id) -> str:
    for account in list_accounts(telegram_id):
        if account["id"] == account_id:
            return account["name"]
    return ""

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    get_or_create_user(update.effective_user.id)

    keyboard = [
        [InlineKeyboardButton(
            "📊 Открыть учёт финансов",
            web_app=WebAppInfo(url=WEB_APP_URL)
        )]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"Привет! 👋\n\n"
        f"Я бот для учёта ваших финансов. Помогу отслеживать доходы и расходы.\n\n"
        f"Нажмите кнопку ниже, чтобы открыть веб-приложение для управления финансами.",
        reply_markup=reply_markup
    )

async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /stats - показать статистику"""
    user = get_or_create_user(update.effective_user.id)
    currency = user["currency"]

    accounts = list_accounts(user["telegram_id"])
    summary = get_stats(user["telegram_id"])

    stats_text = f"📊 **Статистика**\n\n"
    stats_text += f"**Счета:**\n"
    for account in accounts:
        stats_text += f"  • {account['name']}: {account['balance']:.2f} {currency}\n"
    stats_text += f"\n**Общий баланс:** {summary['total_balance']:.2f} {currency}\n"
    stats_text += f"**Доходы:** {summary['total_income']:.2f} {currency}\n"
    stats_text += f"**Расходы:** {summary['total_expense']:.2f} {currency}\n"
    stats_text += f"**Всего операций:** {summary['transactions_count']}"

    await update.message.reply_text(stats_text, parse_mode=ParseMode.MARKDOWN)

async def backup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /backup - экспорт в CSV"""
    user = get_or_create_user(update.effective_user.id)
    transactions = list_transactions(user["telegram_id"])

    if not transactions:
        await update.message.reply_text("Нет данных для экспорта.")
        return

    csv_content = "ID,Тип,Сумма,Категория,Счёт,Описание,Дата\n"
    for t in transactions:
        account_name = _account_name(user["telegram_id"], t["account_id"])
        csv_content += f"{t['id']},{t['type']},{t['amount']},{t['category']},{account_name},{t['description'] or ''},{t['created_at'].strftime('%Y-%m-%d %H:%M:%S')}\n"

    filename = f"backup_{user['telegram_id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    await update.message.reply_document(
        document=csv_content.encode('utf-8'),
        filename=filename,
        caption="📁 Ваш файл с данными"
    )

async def handle_web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка данных от Web App"""
    if update.message.web_app_data:
        try:
            data = json.loads(update.message.web_app_data.data)
            telegram_id = update.effective_user.id
            user = get_or_create_user(telegram_id)
            currency = user["currency"]

            action = data.get('type')

            if action == 'create_account':
                name = data.get('name')
                initial_balance = Decimal(str(data.get('balance', 0)))
                create_account(user_id=telegram_id, name=name, balance=initial_balance)
                await update.message.reply_text(f"✅ Счёт '{name}' создан!")

            elif action == 'expense':
                amount = Decimal(str(data.get('amount')))
                account_id = data.get('account_id')
                category = data.get('category')
                description = data.get('description', '')

                created = create_transaction(
                    user_id=telegram_id,
                    account_id=account_id,
                    transaction_type='expense',
                    amount=amount,
                    category=category,
                    description=description,
                )

                if created:
                    await update.message.reply_text(
                        f"✅ Расход записан!\n"
                        f"Сумма: {amount:.2f} {currency}\n"
                        f"Категория: {category}\n"
                        f"Счёт: {_account_name(telegram_id, account_id)}"
                    )

            elif action == 'income':
                amount = Decimal(str(data.get('amount')))
                account_id = data.get('account_id')
                category = data.get('category')
                description = data.get('description', '')

                created = create_transaction(
                    user_id=telegram_id,
                    account_id=account_id,
                    transaction_type='income',
                    amount=amount,
                    category=category,
                    description=description,
                )

                if created:
                    await update.message.reply_text(
                        f"✅ Доход записан!\n"
                        f"Сумма: {amount:.2f} {currency}\n"
                        f"Категория: {category}\n"
                        f"Счёт: {_account_name(telegram_id, account_id)}"
                    )

        except Exception as e:
            logger.error(f"Ошибка обработки данных Web App: {e}")
            await update.message.reply_text("❌ Произошла ошибка при обработке данных.")

def main():
    init_db()

    application = Application.builder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("stats", stats))
    application.add_handler(CommandHandler("backup", backup))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))

    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
