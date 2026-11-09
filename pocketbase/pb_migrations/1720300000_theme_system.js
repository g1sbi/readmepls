/// <reference path="../pb_data/types.d.ts" />
// Theme default moved to "system" (follow the OS). The old default was "light",
// so most stored "light" values were never a real choice; "sepia" is retired as
// a theme. Data-only: `reader_prefs` stays a json field, only `theme` changes.
// Down maps "system" back to "light" (the old default); the original
// sepia/light split is not recoverable.
function remapTheme(app, matches, next) {
  const rows = app.findRecordsByFilter("users", "reader_prefs != ''", "", 0, 0);
  for (const row of rows) {
    // json fields come back as raw bytes in the JSVM; getString yields the JSON text.
    const raw = row.getString("reader_prefs");
    if (!raw) continue;
    const prefs = JSON.parse(raw);
    if (!prefs || typeof prefs !== "object" || !matches(prefs.theme)) continue;
    row.set("reader_prefs", Object.assign({}, prefs, { theme: next }));
    app.save(row);
  }
}

migrate(
  (app) => remapTheme(app, (t) => t === "sepia" || t === "light", "system"),
  (app) => remapTheme(app, (t) => t === "system", "light")
);
