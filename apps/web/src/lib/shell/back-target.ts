import { under } from "./nav.js";

const FALLBACK = "/library";

/** The parts of the origin's location Back needs (a `URL` fits). */
export interface BackOrigin {
  pathname: string;
  search: string;
}

/**
 * Where the reader's Back goes: the in-app page the user came from (with its
 * query, so a filtered library comes back filtered), else the library.
 * Another article or an auth screen is never a useful "back" (and a fresh
 * deep link has no origin at all), so those fall back too. Only a
 * same-origin path is accepted -- `//host` and `/\host` are protocol-relative
 * in browsers and would leave the app.
 */
export function readerBackTarget(from: BackOrigin | null): string {
  const path = from?.pathname ?? "";
  if (!path.startsWith("/")) return FALLBACK;
  if (path.startsWith("//") || path.startsWith("/\\")) return FALLBACK;
  if (["/read", "/login", "/verify"].some((b) => under(path, b)))
    return FALLBACK;
  return path + (from?.search ?? "");
}
