/** Lowercase, hyphenated slug. Unicode letters/digits kept; everything else
 *  becomes a single hyphen; leading/trailing hyphens trimmed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
