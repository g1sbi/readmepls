/** Parse the comma-separated EXTENSION_ORIGINS allow-list. */
export function extensionOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ACAO headers for an allow-listed origin, else {} (no credentials — bearer auth). */
export function corsHeadersFor(
  origin: string | null,
  allowed: string[],
): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

/** Full preflight response headers, or null when the origin is not allow-listed. */
export function preflightHeaders(
  origin: string | null,
  allowed: string[],
): Record<string, string> | null {
  const base = corsHeadersFor(origin, allowed);
  if (!base["access-control-allow-origin"]) return null;
  return {
    ...base,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-max-age": "600",
  };
}
