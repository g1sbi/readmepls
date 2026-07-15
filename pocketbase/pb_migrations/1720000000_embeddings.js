/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");

    // Global, worker-written vector index keyed to content (dedup across users).
    // Reads allowed to any authenticated user (same posture as content); writes
    // only via the worker's superuser token. Per-user scoping happens at query
    // time, not here.
    const embeddings = new Collection({
      type: "base",
      name: "embeddings",
      fields: [
        { name: "content", type: "relation", required: true, collectionId: content.id, maxSelect: 1, cascadeDelete: true },
        // required: false — chunk_index and char_start are legitimately 0 for a
        // content's first chunk, and PocketBase's number-field "required" rejects
        // the zero value, not just an omitted one.
        { name: "chunk_index", type: "number", required: false, onlyInt: true },
        { name: "char_start", type: "number", required: false, onlyInt: true },
        { name: "char_end", type: "number", required: true, onlyInt: true },
        { name: "text", type: "text", required: true, max: 20000 },
        { name: "vector", type: "json", required: true, maxSize: 200000 },
        { name: "embed_model", type: "text", required: true },
        { name: "dim", type: "number", required: true, onlyInt: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_embeddings_content_chunk_model ON embeddings (content, chunk_index, embed_model)",
        "CREATE INDEX idx_embeddings_content ON embeddings (content)",
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(embeddings);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("embeddings");
    if (c) app.delete(c);
  }
);
