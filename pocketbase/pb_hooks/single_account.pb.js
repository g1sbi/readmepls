// single_account.pb.js — SINGLE_ACCOUNT self-host lock. When SELF_HOSTED=true
// and SINGLE_ACCOUNT=true, the users collection accepts at most one record:
// the first signup succeeds, every create request after that is rejected,
// and GET /api/single-account/status reports the lock state so the web app
// can hide the sign-up UI. Enforcement lives here, not the client — see
// CLAUDE.md's "PocketBase API rules are the security boundary".
//
// NOTE: each handler below requires ./single_account_lib.js rather than
// calling a top-level function in this file — Goja does not expose
// top-level hook-file functions (or same-statement closures) to hook/router
// callbacks (the same limitation search.pb.js works around by inlining
// escapeHtml), but require() of a separate module does work.

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/single_account_lib.js");
  if (lib.isLocked(e.app)) {
    throw new ForbiddenError("This instance is locked to a single account.");
  }
  e.next();
}, "users");

routerAdd("GET", "/api/single-account/status", (e) => {
  const lib = require(__hooks + "/single_account_lib.js");
  return e.json(200, { locked: lib.isLocked(e.app) });
});
