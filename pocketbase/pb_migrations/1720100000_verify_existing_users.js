/// <reference path="../pb_data/types.d.ts" />
// One-off cutover for the SaaS email-verification gate: mark every user that
// already exists at migration time as verified, so accounts predating the gate
// are not locked out. Only new signups (after this migration) go through
// verification. Harmless on self-host, where `verified` is unused.
migrate((app) => {
  const users = app.findRecordsByFilter("users", "verified = false", "", 0, 0);
  for (const u of users) {
    u.set("verified", true);
    app.save(u);
  }
}, (app) => {
  // Down: not reversible in a meaningful way (we can't know which users were
  // unverified before). No-op.
});
