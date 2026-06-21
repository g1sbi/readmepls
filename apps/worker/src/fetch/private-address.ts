import { isIP } from "node:net";

/**
 * True if `ip` is an address the worker must never fetch: loopback, private,
 * link-local (incl. the 169.254.169.254 cloud-metadata endpoint), unique-local,
 * or unspecified. This is the SSRF guard's core predicate — it operates on an
 * already-resolved IP literal, never a hostname.
 */
export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateV4(ip);
  if (fam === 6) return isPrivateV6(ip.toLowerCase());
  // Not a literal IP — treat as unsafe; callers resolve to literals first.
  return true;
}

function isPrivateV4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return true;
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network" / unspecified
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. metadata)
  return false;
}

function isPrivateV6(ip: string): boolean {
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d): re-check the embedded v4.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]!);
  if (/^f[cd][0-9a-f]*:/.test(ip)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]*:/.test(ip)) return true; // fe80::/10 link-local
  return false;
}
