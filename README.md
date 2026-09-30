# Telegram-бот для учёта финансов

Telegram Web App для учёта доходов и расходов. Данные лежат в обычной **Google
Таблице**: их всегда видно глазами, можно править руками и вешать свои формулы.
Отдельный сервер не нужен — API живёт в Apps Script, привязанном к этой же
таблице.

---

## Как это работает

```
Telegram Web App (React, GitHub Pages)
        │  POST  {action, payload, initData}
        ▼
Apps Script Web App (apps-script/Code.gs)  ──►  Google Таблица (листы)
        ▲
        │  long polling
Telegram-бот (backend/bot.py, Python)  ──────►  та же таблица (сервисный аккаунт)
```

Три независимые части:

1. **Frontend** — React-приложение, которое Telegram открывает внутри себя.
   Оно не хранит данные, а только показывает их и отправляет действия.
2. **API** — Apps Script, который читает и пишет листы таблицы. Он же проверяет,
   что запрос пришёл именно из Telegram, а не от случайного человека со ссылкой.
3. **Бот** — отдельный Python-процесс. Он нужен для команды `/start` (кнопка
   запуска Web App) и для `/stats` и `/backup`. Бот работает напрямую с таблицей
   через сервисный аккаунт, минуя Apps Script.

Почему так: ключ доступа к таблице нельзя класть во фронтенд — сборка на GitHub
Pages публичная, её прочитает любой. Поэтому фронтенд обращается к Apps Script, а
тот уже работает с таблицей от твоего имени.

---

## Структура проекта

```
finance-tracker-bot/
├── apps-script/
│   └── Code.gs           # API для Google Таблицы (основной вариант, без сервера)
├── backend/              # нужен только для бота и варианта со своим сервером
│   ├── bot.py            # Telegram-бот: /start, /stats, /backup, приём Web App
│   ├── api.py            # FastAPI-сервер (альтернатива Apps Script)
│   ├── database.py       # Доступ к Google Sheets через gspread
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx       # Всё React-приложение: экраны, формы, диаграмма
    │   ├── api.js        # callApi() — единственная точка выхода в сеть
    │   ├── config.js     # API_URL и API_TOKEN
    │   ├── main.jsx      # Точка входа
    │   └── index.css     # Стили (используют переменные темы Telegram)
    ├── index.html
    ├── package.json
    └── vite.config.js    # base: '/finance-tracker-bot/'
```

---

## Хранение данных

Apps Script и бот сами создают листы, если их нет. Структура:

| Лист | Колонки |
|---|---|
| `users` | `telegram_id`, `currency`, `created_at` |
| `accounts` | `id`, `user_id`, `name`, `balance`, `created_at` |
| `categories` | `id`, `user_id`, `name`, `icon`, `type`, `created_at` |
| `transactions` | `id`, `user_id`, `account_id`, `type`, `amount`, `category`, `description`, `created_at` |

Несколько важных моментов:

- **Не переименовывай заголовки и не меняй их порядок** — код читает строки по
  именам колонок из первой строки листа.
- `id` считается как «максимальный существующий + 1». Удалённые номера повторно
  не используются.
- `type` — строка `income` или `expense`.
- `category` хранит идентификатор категории (`food`, `salary` или `id`
  пользовательской), а не её название. Названия и иконки подставляются на
  фронтенде.
- `created_at` записывается в часовом поясе таблицы. Менять формат колонки
  вручную не стоит.
- Баланс счёта меняется на сервере при каждой операции, поэтому он всегда
  согласован с историей. Если правишь строки в таблице руками, пересчитай
  баланс сам.

---

## Быстрый старт

### Шаг 1. Google Таблица и Apps Script

1. Создай пустую таблицу на https://sheets.google.com. Листы создавать вручную
   не надо — API добавит их сам при первом запросе.
2. В таблице открой **Расширения → Apps Script**.
3. Удали содержимое `Code.gs` и вставь код из [`apps-script/Code.gs`](apps-script/Code.gs)
   (на странице файла на GitHub есть кнопка **Raw** — так удобнее копировать),
   затем **Ctrl+S**.
4. Открой **Свойства скрипта** (⚙️ Project Settings → Script properties) и добавь:

   | Свойство | Обязательно | Зачем |
   |---|---|---|
   | `BOT_TOKEN` | да | Токен бота от BotFather. Включает проверку подписи Telegram и защищает данные |
   | `API_TOKEN` | нет | Общий секрет для запросов без `initData` (например, из скрипта) |
   | `SPREADSHEET_ID` | нет | Нужен только если скрипт **не** привязан к таблице |

5. **Развернуть → Новое развёртывание**:
   - тип: **Веб-приложение**;
   - **Запуск от имени**: Я;
   - **У кого есть доступ**: Все;
   - **Развернуть** и разреши доступ, если Google спросит.
6. Скопируй URL развёртывания — он заканчивается на `/exec`.

Проверка: открой этот URL в браузере. Должно вернуться
`{"ok":true,"data":{"message":"Finance Tracker API работает","version":1}}`.

> **Важно.** После любой правки кода скрипта нужно сделать
> **Развернуть → Управление развёртываниями → ✏️ → Версия: Новая версия →
> Развернуть**. Если нажать «Новое развёртывание», получишь другой URL и фронт
> отвалится. «Управление развёртываниями» сохраняет адрес.

### Шаг 2. Frontend

1. В `frontend/src/config.js` укажи свой URL:

   ```javascript
   export const API_URL = 'https://script.google.com/macros/s/.../exec'
   export const API_TOKEN = '' // заполни, только если задал API_TOKEN в свойствах скрипта
   ```

2. Установи зависимости и собери:

   ```bash
   cd frontend
   npm install
   npm run dev      # локальная разработка на http://localhost:5173
   npm run build    # сборка в dist/
   npm run deploy   # сборка + публикация в ветку gh-pages
   ```

3. Включи GitHub Pages: **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: **gh-pages**, папка **/ (root)**.

4. Приложение будет доступно по адресу
   `https://<твой-логин>.github.io/finance-tracker-bot/`.

> Если переименуешь репозиторий, поправь `base` в `frontend/vite.config.js` —
> иначе стили и скрипты не найдутся.

### Шаг 3. Бот

1. В BotFather укажи Web App URL — адрес с шага 2.4.
2. Создай `backend/.env` по образцу `backend/.env.example`:

   ```ini
   TELEGRAM_BOT_TOKEN=токен_от_BotFather
   WEB_APP_URL=https://<твой-логин>.github.io/finance-tracker-bot/
   SPREADSHEET_ID=id_таблицы_из_шага_1.1
   GOOGLE_APPLICATION_CREDENTIALS=./service_account.json
   ```

3. Положи рядом файл ключа сервисного аккаунта под именем
   `backend/service_account.json`. Как его получить — в разделе
   [«Свой сервер»](#альтернатива-свой-сервер-вместо-apps-script), шаги 1.2.
   Файл уже добавлен в `.gitignore` — в репозиторий он не попадёт.

4. Установи зависимости и запусти:

   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate        # Windows
   # source venv/bin/activate   # Linux/macOS
   pip install -r requirements.txt
   python bot.py
   ```

Бот должен быть запущен постоянно, иначе `/stats` и `/backup` не работают.
Кнопка Web App работает и без него — она просто открывает сайт из BotFather.

---

## Разработка фронтенда

Есть два способа:

- **Быстро посмотреть вёрстку:** `npm run dev` и открыть `http://localhost:5173`.
  Учти: вне Telegram `initData` пустой, поэтому при заданном `BOT_TOKEN` API
  ответит `Запрос должен прийти из Telegram`. Данные не загрузятся — так и должно
  быть. Для отладки внешнего вида это не мешает.
- **Проверить реальные запросы:** подними dev-сервер `npm run dev -- --host`,
  выстави его наружу через `ngrok http 5173` и временно укажи полученный URL
  в BotFather как Web App URL. Тогда Telegram откроет локальную сборку и передаст
  настоящий `initData`.

---

## Справочник API

Все запросы — `POST` на URL веб-приложения. Тело — JSON:

```json
{ "action": "get_user", "payload": { "user_id": 123 }, "initData": "..." }
```

Каждый ответ имеет вид `{"ok": true, "data": ...}` либо
`{"ok": false, "error": "текст"}`.

| Действие | payload | Что делает |
|---|---|---|
| `get_user` | `user_id` | Создаёт пользователя и счёт «Основной», если их нет. Возвращает счета, последние 50 операций и категории |
| `create_account` | `user_id`, `name`, `balance` | Новый счёт |
| `update_account` | `account_id`, `name?`, `balance?` | Изменить счёт |
| `delete_account` | `account_id` | Удалить счёт вместе с его операциями |
| `create_transaction` | `user_id`, `account_id`, `type`, `amount`, `category`, `description` | Добавить операцию и пересчитать баланс |
| `update_transaction` | `transaction_id`, `amount?`, `category?`, `description?`, `account_id?` | Изменить операцию, балансы корректируются |
| `delete_transaction` | `transaction_id` | Удалить операцию и вернуть сумму на счёт |
| `list_transactions` | `user_id` | Все операции пользователя |
| `create_category` | `user_id`, `name`, `icon`, `type` | Своя категория |
| `list_categories` | `user_id` | Список своих категорий |
| `delete_category` | `category_id` | Удалить категорию |
| `get_stats` | `user_id` | Итоги: баланс, доходы, расходы, количество |

Когда задан `BOT_TOKEN`, поле `initData` обязательно, а `user_id` берётся из
подписанных данных Telegram — подменить его в запросе нельзя.

---

## Безопасность

- **`BOT_TOKEN` обязателен.** URL веб-приложения виден в публичной сборке на
  GitHub Pages, поэтому без проверки подписи любой желающий смог бы читать и
  менять твои операции, просто подставив `user_id`.
- Подпись проверяется по схеме Telegram: `HMAC-SHA256` с ключом, производным от
  токена бота. Подделанная или устаревшая (старше суток) подпись отклоняется.
- Каждая операция дополнительно проверяется на принадлежность пользователю:
  чужой `account_id` или `transaction_id` не сработает.
- Ключ сервисного аккаунта (`service_account.json`) и `.env` перечислены в
  `.gitignore`. Никогда не коммить их и не вставляй в код.

---

## Ограничения и нюансы

- Apps Script: ~6 минут на один запуск и порядка 90 минут суммарного времени в
  сутки на обычном Google-аккаунте. Для личного учёта этого с запасом, но это
  не бесконечный ресурс.
- Каждый запрос идёт к Google, поэтому занимает примерно 0.5–2 секунды. Кнопки
  в приложении на время запроса блокируются, чтобы случайно не создать операцию
  дважды.
- Google Sheets — не настоящая база: нет транзакций и блокировок. Одновременная
  запись с двух устройств теоретически может конфликтовать, для одного
  пользователя это не проблема.
- Если в твоём регионе `script.google.com` недоступен без VPN, приложение не
  откроется. Проверить можно так: открой `/exec`-ссылку в браузере — должно
  вернуться `{"ok":true,...}`.

---

## Альтернатива: свой сервер вместо Apps Script

Нужен, если не хочешь зависеть от Apps Script или хочешь держать бота на том же
хостинге. В этом случае фронтенд обращается не к Apps Script, а к FastAPI
(`backend/api.py`), который работает с таблицей через сервисный аккаунт.

### 1.1. Таблица

Создай пустую таблицу на https://sheets.google.com и скопируй её ID из адресной
строки: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.

### 1.2. Сервисный аккаунт

1. Открой https://console.cloud.google.com/ и создай проект.
2. **APIs & Services → Library** → включи **Google Sheets API** и **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → Service account** →
   имя → **Create and continue** → **Done**.
4. Открой аккаунт → вкладка **Keys** → **Add key → Create new key → JSON**.
   Скачается файл ключа — никому его не передавай.
5. В файле найди `client_email` и добавь этот адрес в Google Таблице через
   **Поделиться** с правами **Редактор**. Без этого шага будет ошибка доступа.

### 1.3. Запуск

```bash
cd backend
pip install -r requirements.txt
python api.py     # сервер на http://localhost:8000
python bot.py     # бот, в другом терминале
```

### 1.4. Деплой на Render

1. Зарегистрируйся на https://render.com через GitHub.
2. **New + → Web Service** → подключи репозиторий.
3. Настройки: **Root Directory** `backend`, **Build Command**
   `pip install -r requirements.txt`, **Start Command**
   `uvicorn api:app --host 0.0.0.0 --port $PORT`, тариф **Free**.
4. Переменные окружения на вкладке **Environment**:

   | Ключ | Значение |
   |---|---|
   | `SPREADSHEET_ID` | ID таблицы |
   | `GOOGLE_CREDENTIALS` | Содержимое JSON-ключа одной строкой или в base64 |

   Для base64: `base64 -w0 service_account.json` (Linux/macOS) или
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service_account.json"))`
   (PowerShell).
5. В `frontend/src/config.js` укажи адрес Render и пересобери фронт.

Важно: копия таблицы должна быть одна. Не запускай одновременно Apps Script и
FastAPI на одних и тех же данных — писать в листы должен кто-то один.

---

## Частые проблемы

| Симптом | Причина и решение |
|---|---|
| `Запрос должен прийти из Telegram (нет initData)` | Приложение открыто не из Telegram либо устаревшая ссылка. Открой через бота |
| `Подпись Telegram не прошла проверку` | `BOT_TOKEN` не совпадает с реальным токеном бота |
| `Нет доступа к Операция` | Пытаешься изменить чужую запись; проверь, что `initData` отправляется |
| Правки в `Code.gs` не применяются | Нужно **Управление развёртываниями → Новая версия**, одного сохранения мало |
| `Параметры (String,number[]) не соответствуют сигнатуре` | В скрипте старая версия кода. Обнови `Code.gs` из репозитория |
| Диаграмма и список операций пустые | Операции вне выбранного периода. Проверь даты в фильтре сверху |
| `npm run deploy` падает | Нужны права на запись в репозиторий и настроенный git |
| Страница открывается без стилей | Не совпадает `base` в `vite.config.js` с именем репозитория |
| Пустой экран в Telegram Desktop, на телефоне работает | Сеть блокирует `script.google.com`; проверь через VPN |

---

## Команды бота

- `/start` — приветствие и кнопка запуска Web App.
- `/stats` — сводка: счета, общий баланс, доходы, расходы, число операций.
- `/backup` — выгрузка всех операций в CSV.

## Функционал Web App

- Учёт доходов и расходов, редактирование и удаление операций.
- Несколько счетов с автоматическим пересчётом баланса.
- Свои категории с иконками.
- Фильтр по датам и типу, диаграмма расходов по категориям.
- Тема оформления и данные пользователя из Telegram.

## Технологии

**Frontend:** React 18, Vite, Chart.js, Telegram Web Apps API.

**API:**
- основной вариант — Google Apps Script Web App (`apps-script/Code.gs`),
  Google Sheets как хранилище, проверка `initData` по HMAC-SHA256;
- альтернативный — Python, FastAPI, gspread + google-auth.

**Бот:** Python, python-telegram-bot.
