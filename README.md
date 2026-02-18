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

## Публикация на GitHub Pages и Render

### Часть 1: Размещение API на Render (бесплатно)

1. **Зарегистрируйся на Render**
   - Перейди на https://render.com
   - Нажми "Sign up with GitHub"
   - Авторизуйся через GitHub

2. **Создай новый Web Service**
   - Нажми "New +" → "Web Service"
   - Выбери "Connect a repository"
   - Найди свой репозиторий `finance-tracker-bot`

3. **Настрой сервис**
   - **Name**: `finance-tracker-api` (или любое имя)
   - **Region**: Frankfurt (ближе к Европе)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn api:app --host 0.0.0.0 --port $PORT`

4. **Выбери тариф**
   - Выбери **Free** тариф

5. **Нажми "Create Web Service"**
   - Дождись завершения деплоя (2-5 минут)
   - Скопируй URL сервиса (например: `https://finance-tracker-api.onrender.com`)

6. **Проверь API**
   - Открой в браузере: `https://your-api.onrender.com/api/user/123456`
   - Должен вернуться JSON с данными

### Часть 2: Обновление frontend

1. **Обнови `frontend/src/config.js`**
   ```javascript
   export const API_URL = 'https://your-api.onrender.com'
   ```

2. **Пересобери и задеплой**
   ```bash
   cd frontend
   npm run build
   npm run deploy
   ```

### Часть 3: GitHub Pages для frontend

1. **Включи GitHub Pages**
   - Зайди в настройки репозитория на GitHub
   - Перейди в раздел **Pages**
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** → **/** (root)

2. **Frontend будет доступен по адресу**
   ```
   https://YOUR_USERNAME.github.io/finance-tracker-bot/
   ```

### Часть 4: Настройка бота

1. **Обнови Web App URL в BotFather**
   ```
   https://YOUR_USERNAME.github.io/finance-tracker-bot/
   ```

2. **Обнови `backend/.env`**
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   WEB_APP_URL=https://YOUR_USERNAME.github.io/finance-tracker-bot/
   ```

3. **Запусти бота локально или на хостинге**
   ```bash
   cd backend
   python bot.py
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
