/**
 * Ask the server to re-run extraction for an article. The route re-checks
 * ownership and the verification gate, so a false here means "refused or
 * failed", not "unknown article".
 */
export async function retryArticle(
  fetchFn: typeof fetch,
  id: string,
): Promise<boolean> {
  const res = await fetchFn("/api/retry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ articleId: id }),
  });
  return res.ok;
}
