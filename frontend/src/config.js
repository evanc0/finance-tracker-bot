// Конфигурация API
//
// ИНСТРУКЦИЯ:
// 1. Открой Google Таблицу → Расширения → Apps Script.
// 2. Вставь туда код из apps-script/Code.gs.
// 3. Разверни как веб-приложение (см. README, раздел «Только Google»).
// 4. Скопируй URL развёртывания (заканчивается на /exec) и вставь ниже.
// 5. Пересобери frontend: npm run build && npm run deploy

export const API_URL = 'https://script.google.com/macros/s/AKfycbwJ8mEhx3YdBOk3LcKSZ0MLbEF8U7jLIXRfZYfoNi4PbU_luaMlb50U_4KvdFtVmWxx/exec'

// Необязательно: если в свойствах скрипта задан API_TOKEN, укажи его здесь.
// Учти, что этот файл попадает в публичную сборку, поэтому как единственная
// защита он слабый — надёжнее проверять initData по BOT_TOKEN в Apps Script.
export const API_TOKEN = ''
