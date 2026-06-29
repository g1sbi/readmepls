/// <reference path="../pb_data/types.d.ts" />
// The capture route enqueues jobs with a user-scoped client, so an authenticated
// user must be able to create a job that belongs to them. The job is otherwise
// claimed/updated/read only by the worker's superuser credential (those rules
// stay null = superuser-only), matching the security model: per-user scope on
// the boundary, worker-only on the queue internals.
migrate(
  (app) => {
    const jobs = app.findCollectionByNameOrId("jobs");
    jobs.createRule = '@request.auth.id != "" && user = @request.auth.id';
    app.save(jobs);
  },
  (app) => {
    const jobs = app.findCollectionByNameOrId("jobs");
    jobs.createRule = null;
    app.save(jobs);
  }
);
