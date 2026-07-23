/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.add(new Field({ name: "toc", type: "json" }));
    app.save(content);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.removeByName("toc");
    app.save(content);
  },
);
