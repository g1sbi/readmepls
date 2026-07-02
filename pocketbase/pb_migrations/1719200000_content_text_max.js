/// <reference path="../pb_data/types.d.ts" />
// PocketBase 0.39 applies a default 5000-character cap to text fields left at
// max=0. Article bodies routinely exceed that, so the worker's content.create
// fails validation for long articles. Give the body fields an explicit,
// generous max.
const BODY_MAX = 5000000;

migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    for (const name of ["content_html", "content_text"]) {
      const field = content.fields.getByName(name);
      field.max = BODY_MAX;
    }
    app.save(content);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    for (const name of ["content_html", "content_text"]) {
      const field = content.fields.getByName(name);
      field.max = 0;
    }
    app.save(content);
  }
);
