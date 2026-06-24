/** Convert free-text into a safe FTS5 MATCH expression. Each term is quoted
 *  (so reserved words like AND/OR/NEAR are treated literally) and prefix-matched. */
export function toFtsQuery(raw: string): string {
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map((t) => `"${t}"*`).join(" ");
}
