let csrf = ''
export const setCsrf = (token: string) => {
  csrf = token
}
export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  key?: string,
): Promise<T> {
  const form = data instanceof FormData
  const response = await fetch('/api/v1' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(data && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRFToken': csrf } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(data ? { body: form ? data : JSON.stringify(data) } : {}),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const details = body?.error?.details
      ?.map(
        (d: { row?: number; field?: string; message: string }) =>
          `${d.row ? `Row ${d.row}` : d.field || ''}: ${d.message}`,
      )
      .join('\n')
    throw new Error(
      [body?.error?.message || `Request failed (${response.status}).`, details]
        .filter(Boolean)
        .join('\n'),
    )
  }
  return body as T
}
export function download(path: string) {
  window.location.assign('/api/v1' + path)
}
export const number = (v: number | null | undefined, digits = 1) =>
  v == null
    ? '—'
    : v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
export const dateLabel = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString(
    'en-US',
    options || { month: 'short', day: 'numeric', year: 'numeric' },
  )
