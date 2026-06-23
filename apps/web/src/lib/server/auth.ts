/** Returns a redirect target for a protected page when unauthenticated, else null.
 *  `/login` and `/api/*` are always public (API routes enforce their own auth). */
export function routeGuard(pathname: string, userId: string | null): string | null {
  if (pathname === "/login" || pathname.startsWith("/api/")) return null;
  return userId ? null : "/login";
}
