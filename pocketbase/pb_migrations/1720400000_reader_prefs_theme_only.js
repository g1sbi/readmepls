/// <reference path="../pb_data/types.d.ts" />
// Reader typography settings (font, size, lineHeight, width) are gone; the
// design tokens own them. Rewrite every stored `reader_prefs` object down to
// `{ theme }` (an invalid or retired theme becomes "system"). Data-only:
// `reader_prefs` stays a json field. Null and non-object values are left as is.
// Down is a no-op: the dropped values are not recoverable.
migrate(
  (app) => {
    const rows = app.findRecordsByFilter(
      "users",
      "reader_prefs != ''",
      "",
      0,
      0
    );
    for (const row of rows) {
      // json fields come back as raw bytes in the JSVM; getString yields the JSON text.
      const raw = row.getString("reader_prefs");
      if (!raw) continue;
      // A crash here blocks PocketBase boot, so one unreadable legacy row must
      // not abort the migration — skip it.
      let prefs;
      try {
        prefs = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) continue;
      const theme =
        prefs.theme === "light" ||
        prefs.theme === "dark" ||
        prefs.theme === "system"
          ? prefs.theme
          : "system";
      row.set("reader_prefs", { theme });
      // No validation: a legacy row that fails today's rules must not throw
      // and abort the migration.
      app.saveNoValidate(row);
    }
  },
  () => {}
);
