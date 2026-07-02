import { JSDOM } from "jsdom";

/** Largest dimension in a `sizes` attribute like "16x16 32x32", else 0. */
function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  let max = 0;
  for (const token of sizes.split(/\s+/)) {
    const n = parseInt(token.split("x")[0] ?? "", 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

/**
 * Ordered favicon candidate URLs for a page. Declared <link rel=icon> icons
 * first (largest declared size wins), then apple-touch-icon, then the origin's
 * /favicon.ico as a universal fallback. Absolute, deduped. Pure — no network.
 */
export function pickFaviconCandidates(html: string, baseUrl: string): string[] {
  const doc = new JSDOM(html, { url: baseUrl }).window.document;

  const icons = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    .map((el) => ({ href: el.getAttribute("href"), size: largestSize(el.getAttribute("sizes")) }))
    .filter((x): x is { href: string; size: number } => !!x.href)
    .sort((a, b) => b.size - a.size);

  const apple = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')]
    .map((el) => el.getAttribute("href"))
    .filter((h): h is string => !!h);

  const origin = new URL(baseUrl).origin;
  const ordered = [...icons.map((i) => i.href), ...apple, "/favicon.ico"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of ordered) {
    let abs: string;
    try {
      abs = new URL(href, origin).toString();
    } catch {
      continue;
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}
