const TRACKING = new Set([
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "mc_cid",
  "mc_eid",
]);

export function canonicalizeUrl(input: string): string {
  const u = new URL(input); // throws on invalid
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if (
    (u.protocol === "https:" && u.port === "443") ||
    (u.protocol === "http:" && u.port === "80")
  ) {
    u.port = "";
  }
  const params = [...u.searchParams.entries()].filter(
    ([k]) => !k.toLowerCase().startsWith("utm_") && !TRACKING.has(k.toLowerCase())
  );
  params.sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  let out = u.toString();
  if (u.pathname !== "/" && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}
