import { under } from "./nav.js";

const FALLBACK = "/library";

/**
 * Where the reader's Back goes: the in-app page the user came from, else the
 * library. Another article or an auth screen is never a useful "back" (and a
 * fresh deep link has no origin at all), so those fall back too. Only a
 * same-origin path is accepted -- `//host` and `/\host` are protocol-relative
 * in browsers and would leave the app.
 */
export function readerBackTarget(fromPathname: string | null): string {
  if (!fromPathname || !fromPathname.startsWith("/")) return FALLBACK;
  if (fromPathname.startsWith("//") || fromPathname.startsWith("/\\"))
    return FALLBACK;
  if (["/read", "/login", "/verify"].some((b) => under(fromPathname, b)))
    return FALLBACK;
  return fromPathname;
}
