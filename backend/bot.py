import os
import json
import logging
from datetime import datetime
from decimal import Decimal

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters
from telegram.constants import ParseMode

from database import init_db, User, Account, Transaction, TransactionType
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
WEB_APP_URL = os.getenv("WEB_APP_URL")

SessionLocal = init_db()

def get_user_session(telegram_id: int) -> User:
    """Получить или создать пользователя"""
    user = SessionLocal.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(telegram_id=telegram_id)
        SessionLocal.add(user)
        
        default_account = Account(user_id=telegram_id, name="Основной", balance=0.00)
        SessionLocal.add(default_account)
        SessionLocal.commit()
    return user

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = get_user_session(update.effective_user.id)
    
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
    user = get_user_session(update.effective_user.id)
    
    accounts = SessionLocal.query(Account).filter(Account.user_id == user.telegram_id).all()
    transactions = SessionLocal.query(Transaction).filter(Transaction.user_id == user.telegram_id).all()
    
    total_balance = sum(acc.balance for acc in accounts)
    total_income = sum(t.amount for t in transactions if t.type == TransactionType.INCOME)
    total_expense = sum(t.amount for t in transactions if t.type == TransactionType.EXPENSE)
    
    stats_text = f"📊 **Статистика**\n\n"
    stats_text += f"**Счета:**\n"
    for acc in accounts:
        stats_text += f"  • {acc.name}: {acc.balance:.2f} {user.currency}\n"
    stats_text += f"\n**Общий баланс:** {total_balance:.2f} {user.currency}\n"
    stats_text += f"**Доходы:** {total_income:.2f} {user.currency}\n"
    stats_text += f"**Расходы:** {total_expense:.2f} {user.currency}\n"
    stats_text += f"**Всего операций:** {len(transactions)}"
    
    await update.message.reply_text(stats_text, parse_mode=ParseMode.MARKDOWN)

async def backup(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /backup - экспорт в CSV"""
    user = get_user_session(update.effective_user.id)
    
    transactions = SessionLocal.query(Transaction).filter(
        Transaction.user_id == user.telegram_id
    ).order_by(Transaction.created_at.desc()).all()
    
    if not transactions:
        await update.message.reply_text("Нет данных для экспорта.")
        return
    
    csv_content = "ID,Тип,Сумма,Категория,Счёт,Описание,Дата\n"
    for t in transactions:
        account = SessionLocal.query(Account).filter(Account.id == t.account_id).first()
        csv_content += f"{t.id},{t.type.value},{t.amount},{t.category},{account.name if account else ''},{t.description or ''},{t.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n"
    
    filename = f"backup_{user.telegram_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
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
            user = get_user_session(telegram_id)
            
            action = data.get('type')
            
            if action == 'create_account':
                name = data.get('name')
                initial_balance = Decimal(str(data.get('balance', 0)))
                account = Account(user_id=telegram_id, name=name, balance=initial_balance)
                SessionLocal.add(account)
                SessionLocal.commit()
                await update.message.reply_text(f"✅ Счёт '{name}' создан!")
                
            elif action == 'expense':
                amount = Decimal(str(data.get('amount')))
                account_id = data.get('account_id')
                category = data.get('category')
                description = data.get('description', '')
                
                account = SessionLocal.query(Account).filter(
                    Account.id == account_id,
                    Account.user_id == telegram_id
                ).first()
                
                if account:
                    transaction = Transaction(
                        user_id=telegram_id,
                        account_id=account_id,
                        type=TransactionType.EXPENSE,
                        amount=amount,
                        category=category,
                        description=description
                    )
                    account.balance -= amount
                    SessionLocal.add(transaction)
                    SessionLocal.commit()
                    await update.message.reply_text(
                        f"✅ Расход записан!\n"
                        f"Сумма: {amount:.2f} {user.currency}\n"
                        f"Категория: {category}\n"
                        f"Счёт: {account.name}"
                    )
                    
            elif action == 'income':
                amount = Decimal(str(data.get('amount')))
                account_id = data.get('account_id')
                category = data.get('category')
                description = data.get('description', '')
                
                account = SessionLocal.query(Account).filter(
                    Account.id == account_id,
                    Account.user_id == telegram_id
                ).first()
                
                if account:
                    transaction = Transaction(
                        user_id=telegram_id,
                        account_id=account_id,
                        type=TransactionType.INCOME,
                        amount=amount,
                        category=category,
                        description=description
                    )
                    account.balance += amount
                    SessionLocal.add(transaction)
                    SessionLocal.commit()
                    await update.message.reply_text(
                        f"✅ Доход записан!\n"
                        f"Сумма: {amount:.2f} {user.currency}\n"
                        f"Категория: {category}\n"
                        f"Счёт: {account.name}"
                    )
                    
        except Exception as e:
            logger.error(f"Ошибка обработки данных Web App: {e}")
            await update.message.reply_text("❌ Произошла ошибка при обработке данных.")

def main():
    application = Application.builder().token(BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("stats", stats))
    application.add_handler(CommandHandler("backup", backup))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))
    
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
