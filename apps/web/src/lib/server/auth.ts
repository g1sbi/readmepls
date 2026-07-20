/** Returns a redirect target for a protected page, else null.
 *  `/login`, `/verify`, and `/api/*` are always public (API routes enforce
 *  their own auth + verification). Authenticated-but-unverified SaaS users are
 *  sent to `/verify`; self-host skips the verification gate entirely. */
export function routeGuard(
  pathname: string,
  userId: string | null,
  verified: boolean,
  selfHosted: boolean,
): string | null {
  if (
    pathname === "/login" ||
    pathname === "/verify" ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }
  if (!userId) return "/login";
  if (!selfHosted && !verified) return "/verify";
  return null;
}
