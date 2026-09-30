/**
 * Finance Tracker — Web App API для Google Таблицы.
 *
 * Разворачивается из Apps Script, привязанного к таблице, и заменяет собой
 * серверный API: фронтенд Telegram Web App обращается сюда напрямую, а скрипт
 * читает и пишет листы `users`, `accounts`, `categories`, `transactions`.
 *
 * Протокол:
 *   POST <URL веб-приложения>
 *   Content-Type: text/plain   (без заголовка application/json — иначе браузер
 *                               отправит preflight, который Apps Script не умеет)
 *   body: {"action": "...", "payload": {...}, "token": "...", "initData": "..."}
 *   ответ: {"ok": true, "data": {...}} либо {"ok": false, "error": "..."}
 *
 * Настройки в «Свойствах скрипта» (Project Settings → Script properties):
 *   BOT_TOKEN      — токен бота из BotFather. Если задан, запросы с непустым
 *                    initData проверяются по подписи Telegram, а telegram_id
 *                    берётся из подписанных данных, а не из запроса.
 *   API_TOKEN      — общий секрет. Если задан, запросы без initData должны
 *                    прислать совпадающий token.
 *   SPREADSHEET_ID — нужен только если скрипт НЕ привязан к таблице.
 *
 * Без BOT_TOKEN и API_TOKEN скрипт отвечает всем — это удобно для первых
 * тестов, но ссылку тогда лучше никому не показывать.
 */

var SHEET_HEADERS = {
  users: ['telegram_id', 'currency', 'created_at'],
  accounts: ['id', 'user_id', 'name', 'balance', 'created_at'],
  categories: ['id', 'user_id', 'name', 'icon', 'type', 'created_at'],
  transactions: [
    'id',
    'user_id',
    'account_id',
    'type',
    'amount',
    'category',
    'description',
    'created_at'
  ]
};

var INCOME = 'income';
var EXPENSE = 'expense';
var LOCK_TIMEOUT_MS = 30000;

var _spreadsheet = null;
var _sheetCache = {};
var _headerCache = {};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function doGet() {
  return jsonOutput(ok({ message: 'Finance Tracker API работает', version: 1 }));
}

function doPost(e) {
  try {
    var request = parseRequest(e);
    var telegramId = authorize(request);
    var data = dispatch(request.action, request.payload, telegramId);
    return jsonOutput(ok(data));
  } catch (error) {
    return jsonOutput(fail(error && error.message ? error.message : String(error)));
  }
}

function parseRequest(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents) || {};
    } catch (error) {
      body = {};
    }
  }

  var params = (e && e.parameter) || {};
  var payload = body.payload || {};

  return {
    action: body.action || params.action || '',
    token: body.token || params.token || '',
    initData: body.initData || '',
    payload: payload
  };
}

function dispatch(action, payload, telegramId) {
  var userId = telegramId || toInt(payload.user_id, null);

  switch (action) {
    case 'get_user':
      return getUserData(requireUser(userId));

    case 'create_account':
      return createAccount(requireUser(userId), payload.name, payload.balance);

    case 'update_account':
      return updateAccount(requireUser(userId), toInt(payload.account_id, null), payload);

    case 'delete_account':
      return deleteAccount(requireUser(userId), toInt(payload.account_id, null));

    case 'list_transactions':
      return listTransactions(requireUser(userId));

    case 'create_transaction':
      return createTransaction(requireUser(userId), payload);

    case 'update_transaction':
      return updateTransaction(requireUser(userId), toInt(payload.transaction_id, null), payload);

    case 'delete_transaction':
      return deleteTransaction(requireUser(userId), toInt(payload.transaction_id, null));

    case 'list_categories':
      return listCategories(requireUser(userId));

    case 'create_category':
      return createCategory(requireUser(userId), payload);

    case 'delete_category':
      return deleteCategory(requireUser(userId), toInt(payload.category_id, null));

    case 'get_stats':
      return getStats(requireUser(userId));

    default:
      throw new Error('Неизвестное действие: "' + action + '"');
  }
}

function requireUser(userId) {
  if (!userId) {
    throw new Error('Не удалось определить пользователя Telegram');
  }
  return userId;
}

function jsonOutput(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function ok(data) {
  return { ok: true, data: data === undefined ? null : data };
}

function fail(message) {
  return { ok: false, error: message };
}

// ---------------------------------------------------------------------------
// Авторизация
// ---------------------------------------------------------------------------

function authorize(request) {
  var properties = PropertiesService.getScriptProperties();
  var botToken = properties.getProperty('BOT_TOKEN');
  var apiToken = properties.getProperty('API_TOKEN');
  var userId = toInt(request.payload.user_id, null);

  if (request.initData && botToken) {
    var telegramUser = verifyInitData(request.initData, botToken);
    if (!telegramUser) {
      throw new Error('Подпись Telegram не прошла проверку');
    }
    return toInt(telegramUser.id, userId);
  }

  if (apiToken && request.token !== apiToken) {
    throw new Error('Неверный токен доступа');
  }

  return userId;
}

function verifyInitData(initData, botToken) {
  var params = {};
  var pairs = String(initData).split('&');

  for (var i = 0; i < pairs.length; i++) {
    var separator = pairs[i].indexOf('=');
    if (separator < 0) {
      continue;
    }
    var key = decodeURIComponent(pairs[i].substring(0, separator));
    var value = decodeURIComponent(pairs[i].substring(separator + 1));
    params[key] = value;
  }

  if (!params.hash) {
    return null;
  }

  var providedHash = params.hash;
  delete params.hash;

  var dataCheckString = Object.keys(params)
    .sort()
    .map(function (key) {
      return key + '=' + params[key];
    })
    .join('\n');

  var secretKey = Utilities.computeHmacSha256Signature(botToken, 'WebAppData');
  var signature = Utilities.computeHmacSha256Signature(dataCheckString, secretKey);

  if (toHex(signature) !== providedHash) {
    return null;
  }

  var authDate = toInt(params.auth_date, 0);
  if (authDate && Math.floor(Date.now() / 1000) - authDate > 86400) {
    return null;
  }

  try {
    return JSON.parse(params.user || '{}');
  } catch (error) {
    return null;
  }
}

function toHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var value = bytes[i];
    if (value < 0) {
      value += 256;
    }
    var part = value.toString(16);
    hex += part.length < 2 ? '0' + part : part;
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Приведение типов
// ---------------------------------------------------------------------------

function toInt(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }
  var number = parseInt(String(value).trim(), 10);
  return isNaN(number) ? fallback : number;
}

function toDecimal(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }

  var text = String(value).replace(/\u00a0/g, '').replace(/\s/g, '');
  if (text === '') {
    return 0;
  }

  // Число может прийти в локали таблицы: "1 234,56" или "1,234.56".
  // Десятичный разделитель — последний из встреченных знаков.
  if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (text.indexOf(',') >= 0) {
    var parts = text.split(',');
    text = parts.length === 2 && parts[1].length <= 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  if (text.split('.').length > 2) {
    var lastDot = text.lastIndexOf('.');
    text = text.substring(0, lastDot).replace(/\./g, '') + text.substring(lastDot);
  }

  var parsed = parseFloat(text);
  return isNaN(parsed) ? 0 : parsed;
}

function round2(value) {
  return Math.round(toDecimal(value) * 100) / 100;
}

function toDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'number' && isFinite(value)) {
    return serialToDate(value);
  }

  var text = String(value === null || value === undefined ? '' : value).trim();
  if (text) {
    var parsed = new Date(text.replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

function serialToDate(serial) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function timeZone() {
  return Session.getScriptTimeZone();
}

function now() {
  return Utilities.formatDate(new Date(), timeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function isoString(value) {
  return Utilities.formatDate(toDate(value), timeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

// ---------------------------------------------------------------------------
// Доступ к листам
// ---------------------------------------------------------------------------

function getSpreadsheet() {
  if (_spreadsheet) {
    return _spreadsheet;
  }

  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  _spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!_spreadsheet) {
    throw new Error('Таблица не найдена: привяжи скрипт к таблице или задай SPREADSHEET_ID');
  }
  return _spreadsheet;
}

function getSheet(table) {
  if (_sheetCache[table]) {
    return _sheetCache[table];
  }

  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(table);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(table);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS[table]);
  }

  _sheetCache[table] = sheet;
  return sheet;
}

function getHeader(table) {
  if (!_headerCache[table]) {
    var sheet = getSheet(table);
    var values = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    var header = values
      .map(function (value) {
        return String(value).trim();
      })
      .filter(function (value) {
        return value !== '';
      });
    _headerCache[table] = header.length ? header : SHEET_HEADERS[table].slice();
  }
  return _headerCache[table];
}

function readAll(table) {
  var sheet = getSheet(table);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var header = getHeader(table);
  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var records = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasData = false;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c]).trim() !== '') {
        hasData = true;
        break;
      }
    }
    if (!hasData) {
      continue;
    }

    var record = { _row: i + 2 };
    for (var j = 0; j < header.length; j++) {
      record[header[j]] = row[j] === undefined ? '' : row[j];
    }
    records.push(record);
  }
  return records;
}

function matches(cell, expected) {
  if (expected === null || expected === undefined) {
    return String(cell).trim() === '';
  }
  if (typeof expected === 'number') {
    return toInt(cell, null) === expected;
  }
  return String(cell) === String(expected);
}

function filterRows(table, criteria) {
  return readAll(table).filter(function (record) {
    return Object.keys(criteria).every(function (key) {
      return matches(record[key], criteria[key]);
    });
  });
}

function findRow(table, criteria) {
  var found = filterRows(table, criteria);
  return found.length ? found[0] : null;
}

function nextId(table) {
  var ids = readAll(table)
    .map(function (record) {
      return toInt(record.id, null);
    })
    .filter(function (id) {
      return id !== null;
    });
  return ids.length ? Math.max.apply(null, ids) + 1 : 1;
}

function rowValues(table, record) {
  return getHeader(table).map(function (name) {
    var value = record[name];
    return value === undefined || value === null ? '' : value;
  });
}

function append(table, record) {
  getSheet(table).appendRow(rowValues(table, record));
  return record;
}

function writeRow(table, row, record) {
  var values = rowValues(table, record);
  getSheet(table).getRange(row, 1, 1, values.length).setValues([values]);
}

function deleteRow(table, row) {
  getSheet(table).deleteRow(row);
}

function withLock(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function assertOwner(record, userId, what) {
  if (!record) {
    throw new Error(what + ' не найдено');
  }
  if (userId && toInt(record.user_id, null) !== userId && toInt(record.telegram_id, null) !== userId) {
    throw new Error('Нет доступа к ' + what);
  }
}

// ---------------------------------------------------------------------------
// Пользователи
// ---------------------------------------------------------------------------

function getOrCreateUser(userId) {
  return withLock(function () {
    var record = findRow('users', { telegram_id: userId });
    if (!record) {
      append('users', { telegram_id: userId, currency: 'RUB', created_at: now() });
      append('accounts', {
        id: nextId('accounts'),
        user_id: userId,
        name: 'Основной',
        balance: 0,
        created_at: now()
      });
      record = findRow('users', { telegram_id: userId });
    }
    return {
      telegram_id: toInt(record.telegram_id, userId),
      currency: record.currency || 'RUB'
    };
  });
}

function getUserData(userId) {
  return {
    user: getOrCreateUser(userId),
    accounts: listAccounts(userId),
    transactions: listTransactions(userId, 50),
    categories: listCategories(userId)
  };
}

// ---------------------------------------------------------------------------
// Счета
// ---------------------------------------------------------------------------

function accountView(record) {
  return {
    id: toInt(record.id, 0),
    name: record.name || '',
    balance: round2(record.balance)
  };
}

function listAccounts(userId, limit) {
  var accounts = filterRows('accounts', { user_id: userId }).map(accountView);
  if (limit) {
    accounts = accounts.slice(0, limit);
  }
  return accounts;
}

function createAccount(userId, name, balance) {
  return withLock(function () {
    if (!name) {
      throw new Error('Укажи название счёта');
    }
    var record = {
      id: nextId('accounts'),
      user_id: userId,
      name: name,
      balance: round2(balance),
      created_at: now()
    };
    append('accounts', record);
    return accountView(record);
  });
}

function updateAccount(userId, accountId, payload) {
  return withLock(function () {
    var record = findRow('accounts', { id: accountId });
    assertOwner(record, userId, 'Счёт');

    if (payload.name !== undefined && payload.name !== null) {
      record.name = payload.name;
    }
    if (payload.balance !== undefined && payload.balance !== null) {
      record.balance = round2(payload.balance);
    }

    writeRow('accounts', record._row, record);
    return accountView(record);
  });
}

function deleteAccount(userId, accountId) {
  return withLock(function () {
    var record = findRow('accounts', { id: accountId });
    assertOwner(record, userId, 'Счёт');

    var transactions = filterRows('transactions', { account_id: accountId }).sort(function (a, b) {
      return b._row - a._row;
    });
    transactions.forEach(function (transaction) {
      deleteRow('transactions', transaction._row);
    });

    deleteRow('accounts', record._row);
    return { message: 'Счёт удалён' };
  });
}

// ---------------------------------------------------------------------------
// Категории
// ---------------------------------------------------------------------------

function categoryView(record) {
  return {
    id: toInt(record.id, 0),
    name: record.name || '',
    icon: record.icon || '📝',
    type: record.type || EXPENSE
  };
}

function listCategories(userId) {
  return filterRows('categories', { user_id: userId }).map(categoryView);
}

function createCategory(userId, payload) {
  return withLock(function () {
    if (!payload.name) {
      throw new Error('Укажи название категории');
    }
    var record = {
      id: nextId('categories'),
      user_id: userId,
      name: payload.name,
      icon: payload.icon || '📝',
      type: payload.type === INCOME ? INCOME : EXPENSE,
      created_at: now()
    };
    append('categories', record);
    return categoryView(record);
  });
}

function deleteCategory(userId, categoryId) {
  return withLock(function () {
    var record = findRow('categories', { id: categoryId });
    assertOwner(record, userId, 'Категория');
    deleteRow('categories', record._row);
    return { message: 'Категория удалена' };
  });
}

// ---------------------------------------------------------------------------
// Операции
// ---------------------------------------------------------------------------

function transactionView(record) {
  return {
    id: toInt(record.id, 0),
    type: record.type || EXPENSE,
    amount: round2(record.amount),
    category: record.category || '',
    description: record.description || '',
    account_id: toInt(record.account_id, 0),
    created_at: isoString(record.created_at)
  };
}

function listTransactions(userId, limit) {
  var transactions = filterRows('transactions', { user_id: userId });
  transactions.sort(function (a, b) {
    var left = toDate(a.created_at).getTime();
    var right = toDate(b.created_at).getTime();
    if (left !== right) {
      return right - left;
    }
    return toInt(b.id, 0) - toInt(a.id, 0);
  });
  if (limit) {
    transactions = transactions.slice(0, limit);
  }
  return transactions.map(transactionView);
}

function adjustBalance(record, delta) {
  record.balance = round2(toDecimal(record.balance) + delta);
  writeRow('accounts', record._row, record);
}

function createTransaction(userId, payload) {
  return withLock(function () {
    var type = payload.type === INCOME ? INCOME : payload.type === EXPENSE ? EXPENSE : null;
    if (!type) {
      throw new Error('Неизвестный тип операции: "' + payload.type + '"');
    }

    var accountId = toInt(payload.account_id, null);
    var account = findRow('accounts', { id: accountId });
    assertOwner(account, userId, 'Счёт');

    var amount = round2(payload.amount);
    var record = {
      id: nextId('transactions'),
      user_id: userId,
      account_id: accountId,
      type: type,
      amount: amount,
      category: payload.category || '',
      description: payload.description || '',
      created_at: now()
    };
    append('transactions', record);

    adjustBalance(account, type === EXPENSE ? -amount : amount);
    return transactionView(record);
  });
}

function updateTransaction(userId, transactionId, payload) {
  return withLock(function () {
    var record = findRow('transactions', { id: transactionId });
    assertOwner(record, userId, 'Операция');

    var type = record.type === INCOME ? INCOME : EXPENSE;
    var sign = type === EXPENSE ? -1 : 1;
    var oldAccountId = toInt(record.account_id, null);

    if (payload.amount !== undefined && payload.amount !== null) {
      var newAmount = round2(payload.amount);
      var oldAmount = round2(record.amount);
      if (newAmount !== oldAmount) {
        var diff = round2(newAmount - oldAmount);
        var currentAccount = findRow('accounts', { id: oldAccountId });
        if (currentAccount) {
          adjustBalance(currentAccount, sign * diff);
        }
        record.amount = newAmount;
      }
    }

    if (
      payload.account_id !== undefined &&
      payload.account_id !== null &&
      toInt(payload.account_id, null) !== oldAccountId
    ) {
      var movedAmount = round2(record.amount);
      var fromAccount = findRow('accounts', { id: oldAccountId });
      if (fromAccount) {
        adjustBalance(fromAccount, -sign * movedAmount);
      }

      var targetAccount = findRow('accounts', { id: toInt(payload.account_id, null) });
      if (targetAccount) {
        adjustBalance(targetAccount, sign * movedAmount);
      }

      record.account_id = toInt(payload.account_id, null);
    }

    if (payload.category !== undefined && payload.category !== null) {
      record.category = payload.category;
    }
    if (payload.description !== undefined && payload.description !== null) {
      record.description = payload.description;
    }

    writeRow('transactions', record._row, record);
    return transactionView(record);
  });
}

function deleteTransaction(userId, transactionId) {
  return withLock(function () {
    var record = findRow('transactions', { id: transactionId });
    assertOwner(record, userId, 'Операция');

    var type = record.type === INCOME ? INCOME : EXPENSE;
    var sign = type === EXPENSE ? -1 : 1;
    var account = findRow('accounts', { id: toInt(record.account_id, null) });
    if (account) {
      adjustBalance(account, -sign * round2(record.amount));
    }

    deleteRow('transactions', record._row);
    return { message: 'Операция удалена' };
  });
}

// ---------------------------------------------------------------------------
// Статистика
// ---------------------------------------------------------------------------

function getStats(userId) {
  var accounts = listAccounts(userId);
  var transactions = listTransactions(userId);

  var totalBalance = 0;
  var totalIncome = 0;
  var totalExpense = 0;

  accounts.forEach(function (account) {
    totalBalance += account.balance;
  });
  transactions.forEach(function (transaction) {
    if (transaction.type === INCOME) {
      totalIncome += transaction.amount;
    } else {
      totalExpense += transaction.amount;
    }
  });

  return {
    total_balance: round2(totalBalance),
    total_income: round2(totalIncome),
    total_expense: round2(totalExpense),
    accounts_count: accounts.length,
    transactions_count: transactions.length
  };
}
