/**
 * [INPUT]: optional CLI date and full execution timestamp strings.
 * [OUTPUT]: validated timestamp and the date used for historical quote lookup.
 * [POS]: shared date handling for stock/fund trade commands.
 * [RUNTIME]: shared / CLI.
 * [PROTOCOL]: preserve valid `traded_at` values verbatim; derive quote dates
 *             from the timestamp's YYYY-MM-DD prefix only when --date is absent.
 */

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const INVALID_TIMESTAMP_MESSAGE =
  "Expected an ISO timestamp such as 2026-09-14T15:37:42-04:00 or 2026-09-14T19:37:42Z";

/** Validate --traded-at without normalizing the user's original string. */
export function validateTradedAt(value: string): string {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid --traded-at: ${value}. ${INVALID_TIMESTAMP_MESSAGE}.`);
  }

  const [, date, hours, minutes, seconds, timezone] = match;
  const dateAtUtc = Date.parse(`${date}T00:00:00Z`);
  const validDate =
    !Number.isNaN(dateAtUtc) && new Date(dateAtUtc).toISOString().slice(0, 10) === date;
  const validTime =
    Number(hours) <= 23 && Number(minutes) <= 59 && Number(seconds ?? "0") <= 59;
  const validOffset =
    timezone === "Z" ||
    (Number(timezone.slice(1, 3)) <= 23 && Number(timezone.slice(4, 6)) <= 59);

  if (!validDate || !validTime || !validOffset || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid --traded-at: ${value}. ${INVALID_TIMESTAMP_MESSAGE}.`);
  }

  return value;
}

export interface ResolvedTradeDates {
  /** Date passed to the historical quote/NAV connector, if any. */
  quoteDate?: string;
  /** Value passed to transactions.traded_at, if the CLI supplied one. */
  tradedAt?: string;
}

/** Resolve lookup and storage dates while preserving date-only behavior. */
export function resolveTradeDates(date?: string, tradedAt?: string): ResolvedTradeDates {
  if (tradedAt == null) {
    return { quoteDate: date, tradedAt: date };
  }

  const validated = validateTradedAt(tradedAt);
  return {
    quoteDate: date ?? validated.slice(0, 10),
    tradedAt: validated,
  };
}
