/// <reference path="../pb_data/types.d.ts" />
// article_tags.article was created without cascadeDelete, so deleting an article
// orphaned its tag-links. Align it with highlights/collection_items which already
// cascade, so a single articles.delete() cleans up all per-user dependents.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("article_tags");
    const field = col.fields.getByName("article");
    field.cascadeDelete = true;
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("article_tags");
    const field = col.fields.getByName("article");
    field.cascadeDelete = false;
    app.save(col);
  }
);
