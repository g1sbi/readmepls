/** Only real web pages are capturable; browser-internal and file URLs are not. */
export function canCapture(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
