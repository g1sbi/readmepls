/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const content = app.findCollectionByNameOrId("content");

    // --- sources (global cache; public site metadata only) ---
    const sources = new Collection({
      type: "base",
      name: "sources",
      fields: [
        { name: "host", type: "text", required: true },
        { name: "name", type: "text" },
        { name: "favicon", type: "file", maxSelect: 1, maxSize: 1048576,
          mimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"] },
        { name: "favicon_status", type: "text", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_sources_host ON sources (host)",
      ],
      // authenticated users may read; only superuser/worker token writes
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(sources);

    // --- content.source relation ---
    content.fields.add(new Field({
      name: "source", type: "relation", collectionId: sources.id, maxSelect: 1,
    }));
    app.save(content);

    // --- source_favorites (per-user) ---
    const favorites = new Collection({
      type: "base",
      name: "source_favorites",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "source", type: "relation", required: true, collectionId: sources.id, maxSelect: 1 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_source_favorites_user_source ON source_favorites (user, source)",
      ],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(favorites);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.removeByName("source");
    app.save(content);
    for (const name of ["source_favorites", "sources"]) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
