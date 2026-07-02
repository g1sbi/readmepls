/// <reference path="../pb_data/types.d.ts" />
// Product rename: the free tier is now called "standard". This is a data-only
// migration — the `tier` field stays a plain text column, only existing row
// values change. Empty string is included alongside "free" because `tier` has
// never been required, so pre-existing rows may have no value set.
migrate(
  (app) => {
    const rows = app.findRecordsByFilter("users", "tier = 'free' || tier = ''", "", 0, 0);
    for (const row of rows) {
      row.set("tier", "standard");
      app.save(row);
    }
  },
  (app) => {
    const rows = app.findRecordsByFilter("users", "tier = 'standard'", "", 0, 0);
    for (const row of rows) {
      row.set("tier", "free");
      app.save(row);
    }
  }
);
