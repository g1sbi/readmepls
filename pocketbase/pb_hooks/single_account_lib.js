// single_account_lib.js — shared SINGLE_ACCOUNT lock check, required by
// single_account.pb.js. Deliberately NOT named *.pb.js: PocketBase only
// auto-loads that pattern as a hook file, and this one must only run via
// require() from within a callback (see the note in single_account.pb.js
// about why the check can't just be a top-level function in that file).

module.exports = {
  isLocked: function (app) {
    if (
      $os.getenv("SELF_HOSTED") !== "true" ||
      $os.getenv("SINGLE_ACCOUNT") !== "true"
    ) {
      return false;
    }
    const result = new DynamicModel({ count: 0 });
    app.db().newQuery("SELECT COUNT(*) as count FROM users").one(result);
    return result.count > 0;
  },
};
