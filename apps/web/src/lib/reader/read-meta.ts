// Display-only labels for the reader's article meta line. Both values come
// from data the app already stores (content.read_time, article.created).

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** `"12 min read"`, or null when there is no estimate to show. */
export function readTimeLabel(
  minutes: number | null | undefined,
): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return `${Math.ceil(minutes)} min read`;
}

/**
 * `"Saved Nov 2"` within the current year, `"Saved Nov 2, 2025"` before it.
 * PocketBase stores timestamps as `YYYY-MM-DD HH:mm:ss.SSSZ`; the space has to
 * become a `T` for Date to parse it portably.
 */
export function savedLabel(created: string, now: Date = new Date()): string {
  const d = new Date(created.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const fmt =
    d.getFullYear() === now.getFullYear() ? MONTH_DAY : MONTH_DAY_YEAR;
  return `Saved ${fmt.format(d)}`;
}
