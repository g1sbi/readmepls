// bootstrap_superusers.pb.js
// Provisions admin and worker superusers from environment variables on every
// boot. Runs AFTER e.next() so the _superusers collection and all migrations
// are guaranteed to exist. Fully idempotent: re-runs against an existing
// /pb_data volume are safe (update password if record exists, create if not).
//
// Env vars consumed (all must be set for the corresponding user to be
// provisioned; either pair can be omitted to skip that user):
//   PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD
//   PB_WORKER_EMAIL / PB_WORKER_PASSWORD
//
// Credentials are read from the process environment — never from argv — so
// they do not appear in /proc/<pid>/cmdline.

onBootstrap((e) => {
  // Let PocketBase finish its own initialisation (migrations, collections, …)
  // before we touch the _superusers collection.
  e.next();

  const pairs = [
    [$os.getenv("PB_ADMIN_EMAIL"),  $os.getenv("PB_ADMIN_PASSWORD")],
    [$os.getenv("PB_WORKER_EMAIL"), $os.getenv("PB_WORKER_PASSWORD")],
  ];

  const col = $app.findCollectionByNameOrId("_superusers");

  for (const [email, password] of pairs) {
    // Skip if either side of the pair is absent/empty.
    if (!email || !password) {
      continue;
    }

    let record;
    try {
      // findAuthRecordByEmail throws when the record does not exist.
      record = $app.findAuthRecordByEmail("_superusers", email);
      // Existing superuser — update password only.
      record.setPassword(password);
    } catch (_) {
      // No record found — create a new one.
      record = new Record(col);
      record.set("email", email);
      record.setPassword(password);
    }

    $app.save(record);
  }
});
