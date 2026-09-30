import { API_URL, API_TOKEN } from './config'

const tg = window.Telegram?.WebApp

/**
 * Вызов API Apps Script.
 *
 * Тело отправляется без заголовка Content-Type: браузер сам поставит
 * text/plain, а это «простой» запрос — preflight не отправляется. Если задать
 * application/json, браузер сделает OPTIONS, который Apps Script не обработает.
 */
export async function callApi(action, payload = {}) {
  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      payload,
      token: API_TOKEN || '',
      initData: tg?.initData || ''
    }),
    redirect: 'follow'
  })

  let parsed
  try {
    parsed = JSON.parse(await response.text())
  } catch (error) {
    throw new Error('Некорректный ответ API. Проверь, что развёртывание доступно всем.')
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'Ошибка API')
  }
  return parsed.data
}
