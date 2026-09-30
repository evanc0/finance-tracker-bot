# Telegram-бот для учёта финансов

Приложение состоит из Telegram-бота с Web App интерфейсом для управления финансами.

## Структура проекта

```
finance-tracker-bot/
├── apps-script/
│   └── Code.gs         # API для Google Таблицы (вариант без сервера)
├── backend/            # нужен только для запуска бота / варианта с Render
│   ├── bot.py          # Telegram бот
│   ├── api.py          # FastAPI сервер
│   ├── database.py     # Слой доступа к Google Sheets (gspread)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx     # Основное React-приложение
    │   ├── api.js      # Вызовы API (Apps Script)
    │   ├── main.jsx    # Точка входа
    │   └── index.css   # Стили
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## Развёртывание API в Apps Script (рекомендуемый вариант)

Здесь не нужны ни Render, ни сервисный аккаунт, ни JSON-ключ: код живёт прямо
внутри Google Таблицы и работает от твоего имени.

1. Открой свою Google Таблицу → **Расширения → Apps Script**.
2. Удали содержимое `Code.gs` и вставь код из [`apps-script/Code.gs`](apps-script/Code.gs).
3. Открой **Свойства скрипта** (⚙️ Project Settings → Script properties) и добавь:
   - `BOT_TOKEN` — токен бота от BotFather. Если задан, запросы с `initData`
     проверяются по подписи Telegram, а `telegram_id` берётся из подписанных
     данных, а не из тела запроса.
   - `API_TOKEN` — необязательный общий секрет для запросов без `initData`.
   - `SPREADSHEET_ID` — нужен только если скрипт **не** привязан к таблице.
4. **Развернуть → Новое развёртывание**:
   - тип: **Веб-приложение**;
   - **Запуск от имени**: Я;
   - **У кого есть доступ**: Все;
   - нажми **Развернуть**.
5. Скопируй URL развёртывания (заканчивается на `/exec`) и вставь его
   в `frontend/src/config.js` → `API_URL`.
6. Пересобери и опубликуй фронтенд:

   ```bash
   cd frontend
   npm run build
   npm run deploy
   ```

Проверка: открой URL в браузере — должно вернуться `{"ok":true,...}`.

> **Важно:** после правки кода нужно сделать
> **Развернуть → Управление развёртываниями → ✏️ → Версия: Новая версия → Развернуть**.
> Без этого тот же URL продолжит отдавать старый код.

Ограничения Apps Script: ~6 минут на один запуск и ~90 минут суммарного времени
в сутки для обычного Google-аккаунта, поэтому ссылку на веб-приложение лучше
никому не показывать и включить проверку по `BOT_TOKEN`.

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

## Публикация на GitHub Pages и Render (альтернатива)

> **Это запасной вариант.** Основной путь — Apps Script (см. выше): там не нужны
> ни Render, ни сервисный аккаунт. Раздел ниже актуален, если ты сознательно
> хочешь держать отдельный сервер (например, чтобы запускать на нём бота).
> В этом случае в `frontend/src/config.js` укажи адрес Render вместо адреса
> Apps Script.

> **База данных — Google Таблица.** Проект хранит данные в Google Sheets через сервисный
> аккаунт (модуль `backend/database.py`, библиотека `gspread`). PostgreSQL и SQLite больше
> не используются. При первом запуске API обязательно задай `SPREADSHEET_ID` и
> `GOOGLE_CREDENTIALS` (см. ниже), иначе сервер не стартует.

### Часть 1: Google Таблица и API на Render (бесплатно)

#### 1.1. Подготовь Google Таблицу

1. Создай пустую таблицу на https://sheets.google.com (например, `finance-tracker`).
   Листы создавать вручную не нужно: при первом запуске API сам добавит листы
   `users`, `accounts`, `categories`, `transactions` с заголовками.
2. Скопируй **ID таблицы** из адресной строки:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

#### 1.2. Создай сервисный аккаунт Google

1. Открой https://console.cloud.google.com/ и создай проект.
2. **APIs & Services → Library** → найди и включи **Google Sheets API**
   (на всякий случай включи и **Google Drive API**).
3. **APIs & Services → Credentials → Create Credentials → Service account** →
   задай имя → **Create and continue** → **Done**.
4. Открой созданный аккаунт → вкладка **Keys** → **Add key → Create new key → JSON**.
   Скачается файл с ключом — никому его не передавай.
5. В файле ключа найди поле `client_email`
   (например, `finance-bot@project.iam.gserviceaccount.com`) и добавь этот email
   в Google Таблице через **Поделиться** с правами **Редактор**.
   Без этого шага API получит ошибку доступа.

#### 1.3. Задеплой API на Render

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
   - **Region**: Frankfurt
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn api:app --host 0.0.0.0 --port $PORT`

4. **Добавь переменные окружения**
   - `SPREADSHEET_ID` — ID таблицы из шага 1.1
   - `GOOGLE_CREDENTIALS` — всё содержимое JSON-ключа одной строкой
     (либо в base64: `base64 -w0 service_account.json`)
   - `TELEGRAM_BOT_TOKEN` и `WEB_APP_URL` — если этот же сервис запускает бота
   - Нажми "Save"

5. **Выбери тариф**
   - Выбери **Free** тариф

6. **Нажми "Create Web Service"**
   - Дождись завершения деплоя (2-5 минут)
   - Скопируй URL сервиса (например: `https://finance-tracker-api.onrender.com`)

7. **Проверь API**
   - Открой в браузере: `https://your-api.onrender.com/api/user/123456`
   - Должен вернуться JSON с данными

> **Важно:** данные лежат в твоей Google Таблице и не теряются при перезапуске Render.
> Бот (`bot.py`) использует ту же таблицу — запускай его отдельным сервисом/процессом
> с теми же переменными окружения.

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

**Frontend:**
- React 18
- Vite
- Chart.js (диаграммы)
- Telegram Web Apps API

**API (вариант Apps Script):**
- Google Apps Script Web App (`apps-script/Code.gs`)
- Google Sheets как хранилище
- Проверка `initData` по HMAC-SHA256

**Backend (вариант с сервером / для бота):**
- Python + python-telegram-bot
- FastAPI (REST API)
- gspread + google-auth (доступ к Google Таблице)
- Google Sheets (база данных)

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
