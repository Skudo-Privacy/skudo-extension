/**
 * Gli orari del server.
 *
 * L'API scrive `created_at` come `2026-10-25 14:03:00`: UTC, ma senza il fuso
 * nella stringa. `Date.parse` la legge come ora locale, quindi per chi sta a
 * UTC+2 un alias nato un istante fa risulta di due ore fa. Qui si dice al
 * parser che e' UTC.
 */
export function parseServerTime(value) {
  if (typeof value !== 'string' || !value) return NaN
  // Gia' con fuso (`Z` o `+02:00`): non si tocca.
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(value)) return Date.parse(value)
  return Date.parse(`${value.trim().replace(' ', 'T')}Z`)
}
