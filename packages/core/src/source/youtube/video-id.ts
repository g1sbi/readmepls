/** Video id from a youtube.com/watch or youtu.be URL, else null. */
export function parseVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  return null;
}
