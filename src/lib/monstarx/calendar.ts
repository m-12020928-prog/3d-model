/** Resolve a user timezone in an effect/event handler. SSR never invents a browser timezone. */
export function browserTimeZone(): string | null {
  if (typeof window === 'undefined') return null
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null }
  catch { return null }
}

/** The Gregorian date of an absolute instant in an explicit timezone, independent of the server's timezone. */
export function calendarDateKey(instant: Date | number | string, timeZone: string): string {
  if (!timeZone || !timeZone.trim() || /^[+-]/.test(timeZone)) throw new RangeError('An IANA timezone is required')
  // A local/date-only string has no absolute meaning across SSR and browsers. Store it as a date key directly.
  if (typeof instant === 'string' && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(instant)) throw new RangeError('Use an absolute ISO timestamp with Z or an offset')
  const date = new Date(instant instanceof Date ? instant.getTime() : instant)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid instant')
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', era: 'short' }).formatToParts(date)
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === name)?.value
  const year = Number(part('year'))
  if (part('era') !== 'AD' || year < 1 || year > 9999) throw new RangeError('Date keys support years 0001 through 9999')
  return `${String(year).padStart(4, '0')}-${part('month')}-${part('day')}`
}
