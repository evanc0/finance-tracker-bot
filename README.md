# Telegram-бот для учёта финансов

Приложение состоит из Telegram-бота с Web App интерфейсом для управления финансами.

## Структура проекта

```
finance-tracker-bot/
├── backend/
│   ├── bot.py          # Telegram бот
│   ├── api.py          # FastAPI сервер
│   ├── database.py     # Модель данных SQLAlchemy
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx     # Основное React-приложение
    │   ├── main.jsx    # Точка входа
    │   └── index.css   # Стили
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Установка и запуск

### 1. Backend

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Установить зависимости
pip install -r requirements.txt

# Создать файл .env и настроить
copy .env.example .env
# Отредактировать .env, добавив токен бота и URL Web App

# Запустить API сервер (в отдельном терминале)
python api.py

# Запустить бота (в другом терминале)
python bot.py
```

### 2. Frontend

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev

# Собрать для продакшена
npm run build
```

## Публикация на GitHub Pages

### 1. Создайте репозиторий на GitHub

```bash
cd finance-tracker-bot

# Инициализировать git
git init

# Добавить все файлы
git add .

# Сделать коммит
git commit -m "Initial commit"

# Добавить удалённый репозиторий (замените YOUR_USERNAME на ваш логин)
git remote add origin https://github.com/YOUR_USERNAME/finance-tracker-bot.git

# Отправить в main ветку
git branch -M main
git push -u origin main
```

### 2. Включите GitHub Pages

1. Зайдите в настройки репозитория на GitHub
2. Перейдите в раздел **Pages**
3. В разделе **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** → **/** (root)
4. Нажмите **Save**

### 3. Разместите frontend на GitHub Pages

```bash
cd frontend

# Установить gh-pages (если ещё не установлен)
npm install

# Задеплоить на GitHub Pages
npm run deploy
```

После деплоя ваш Web App будет доступен по адресу:
```
https://YOUR_USERNAME.github.io/finance-tracker-bot/
```

### 4. Настройте бота

В BotFather укажите URL вашего Web App:
```
https://YOUR_USERNAME.github.io/finance-tracker-bot/
```

В файле `backend/.env` обновите:
```
TELEGRAM_BOT_TOKEN=your_token_here
WEB_APP_URL=https://YOUR_USERNAME.github.io/finance-tracker-bot/
```

## Команды бота

- `/start` - Запуск бота, открытие Web App
- `/stats` - Показать статистику по финансам
- `/backup` - Экспорт данных в CSV

## Функционал Web App

- ✅ Учёт доходов и расходов
- ✅ Управление счетами
- ✅ Категории операций
- ✅ Статистика и диаграммы
- ✅ Интеграция с Telegram (Theme, initData)

## Технологии

**Backend:**
- Python + python-telegram-bot
- FastAPI (REST API)
- SQLAlchemy (ORM)
- SQLite (база данных)

**Frontend:**
- React 18
- Vite
- Chart.js (диаграммы)
- Telegram Web Apps API

## Локальный запуск с ngrok

Для тестирования Web App локально:

```bash
# Установить ngrok
# Запустить API
python api.py

# Запустить frontend
npm run dev

# В другом терминале запустить ngrok
ngrok http 5173
```

Полученный URL из ngrok укажите в BotFather как Web App URL.
