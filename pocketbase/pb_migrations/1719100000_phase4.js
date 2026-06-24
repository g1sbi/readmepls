/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const articles = app.findCollectionByNameOrId("articles");

    // --- highlights (per-user annotations) ---
    const highlights = new Collection({
      type: "base",
      name: "highlights",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1, cascadeDelete: true },
        { name: "text", type: "text", required: true },
        { name: "prefix", type: "text" },
        { name: "suffix", type: "text" },
        { name: "start_offset", type: "number" },
        { name: "end_offset", type: "number" },
        { name: "color", type: "text", required: true },
        { name: "note", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_highlights_article ON highlights (article)"],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(highlights);

    // --- collections (flat in v1; parent/order kept for forward-compat) ---
    const collections = new Collection({
      type: "base",
      name: "collections",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        { name: "parent", type: "text" },
        { name: "order", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_collections_user_slug ON collections (user, slug)"],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(collections);

    // --- collection_items (M:N; relation-scoped rule like article_tags) ---
    const collectionItems = new Collection({
      type: "base",
      name: "collection_items",
      fields: [
        { name: "collection", type: "relation", required: true, collectionId: collections.id, maxSelect: 1, cascadeDelete: true },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1, cascadeDelete: true },
        { name: "order", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_collection_items_collection ON collection_items (collection)"],
      listRule: "collection.user = @request.auth.id",
      viewRule: "collection.user = @request.auth.id",
      createRule: "collection.user = @request.auth.id",
      updateRule: "collection.user = @request.auth.id",
      deleteRule: "collection.user = @request.auth.id",
    });
    app.save(collectionItems);

    // --- FTS5 full-text index over content (standalone; PB ids are text) ---
    app.db().newQuery(
      "CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(content_id UNINDEXED, title, body)"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_ai AFTER INSERT ON content BEGIN " +
      "INSERT INTO content_fts(content_id, title, body) VALUES (new.id, new.title, new.content_text); END"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_ad AFTER DELETE ON content BEGIN " +
      "DELETE FROM content_fts WHERE content_id = old.id; END"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_au AFTER UPDATE ON content BEGIN " +
      "DELETE FROM content_fts WHERE content_id = old.id; " +
      "INSERT INTO content_fts(content_id, title, body) VALUES (new.id, new.title, new.content_text); END"
    ).execute();
    // backfill existing rows
    app.db().newQuery(
      "INSERT INTO content_fts(content_id, title, body) SELECT id, title, content_text FROM content"
    ).execute();
  },
  (app) => {
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_ai").execute();
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_ad").execute();
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_au").execute();
    app.db().newQuery("DROP TABLE IF EXISTS content_fts").execute();
    for (const name of ["collection_items", "collections", "highlights"]) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
