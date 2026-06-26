/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.add(new Field({ name: "published_at", type: "text" }));
    app.save(content);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.removeByName("published_at");
    app.save(content);
  }
);
