// search.pb.js — GET /api/search?q=… : full-text search scoped to the caller's
// articles. Reads the content_fts virtual table (Task 3 migration) and joins to
// the authenticated user's articles so results never leak across tenants.

routerAdd("GET", "/api/search", (e) => {
  const raw = e.request.url.query().get("q") || "";

  // Same transform as @readmepls/core toFtsQuery: lowercase alphanumeric terms,
  // each quoted (operators neutralized) and prefix-matched. Kept in sync by contract.
  // KNOWN LIMITATION (v1): Goja (PocketBase JSVM) rejects Unicode property
  // escapes (\p{L}/\p{N}), so non-ASCII query terms are dropped here. The TS
  // toFtsQuery keeps full Unicode; the route is ASCII-only until this is revisited.
  const terms = (raw.toLowerCase().match(/[a-z0-9]+/g) || []);
  const matchExpr = terms.map((t) => '"' + t + '"*').join(" ");
  if (!matchExpr) {
    return e.json(200, { results: [] });
  }

  const uid = e.auth.id;
  // rank is a float from bm25(); use "" so DynamicModel infers string, avoiding
  // a Goja int64 scan error when the value is a negative float like -1e-06.
  const rows = arrayOf(new DynamicModel({ articleId: "", title: "", snippet: "", rank: "" }));

  e.app.db()
    .newQuery(
      "SELECT a.id AS articleId, cf.title AS title, " +
      "snippet(content_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet, " +
      "bm25(content_fts) AS rank " +
      "FROM content_fts cf " +
      "JOIN articles a ON a.content = cf.content_id " +
      "WHERE content_fts MATCH {:q} AND a.user = {:uid} " +
      "ORDER BY rank LIMIT 50"
    )
    .bind({ q: matchExpr, uid: uid })
    .all(rows);

  const mapped = rows.map((r) => ({
    articleId: r.articleId,
    title: r.title,
    snippet: r.snippet,
    rank: Number(r.rank),
  }));
  return e.json(200, { results: mapped });
}, $apis.requireAuth());
