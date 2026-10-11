/**
 * NetSentinel Date & Time Utilities
 *
 * Ensures consistent handling of UTC timestamps received from the backend,
 * properly converting them to the user's browser local timezone.
 */

/**
 * Parses any timestamp (ISO string, number, or Date) reliably as UTC.
 *
 * If an ISO string does not specify a timezone (e.g. '2026-10-11T15:30:00'),
 * ECMAScript's standard `new Date(str)` incorrectly assumes local time,
 * causing a time shift (e.g., 2 hours behind in Rome / CEST).
 * This function appends 'Z' when no timezone offset is present.
 */
export function parseUtcDate(ts: string | number | Date | null | undefined): Date {
  if (ts === null || ts === undefined || ts === '') {
    return new Date();
  }
  if (ts instanceof Date) {
    return ts;
  }
  if (typeof ts === 'number') {
    return new Date(ts);
  }

  const str = String(ts).trim();
  // Check if string already contains a timezone designator:
  // - ends with 'Z'
  // - ends with +HH:MM or -HH:MM or +HHMM or -HHMM
  const hasTimezone = /Z$/i.test(str) || /[+-]\d{2}(?::?\d{2})?$/.test(str);

  if (hasTimezone) {
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  // If missing timezone, treat as UTC by appending 'Z'
  const utcStr = str.includes('T') ? `${str}Z` : `${str.replace(' ', 'T')}Z`;
  const parsed = new Date(utcStr);
  return isNaN(parsed.getTime()) ? new Date(str) : parsed;
}

/**
 * Formats time as HH:MM:SS in the local timezone.
 */
export function formatTimeOnly(
  ts: string | number | Date | null | undefined,
  locale?: string
): string {
  const d = parseUtcDate(ts);
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formats date and time as DD/MM/YYYY HH:MM:SS in the local timezone.
 */
export function formatDateTime(
  ts: string | number | Date | null | undefined,
  locale?: string
): string {
  const d = parseUtcDate(ts);
  return `${d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

