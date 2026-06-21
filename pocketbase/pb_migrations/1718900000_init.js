/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // --- content (global cache; public extractions only) ---
    const content = new Collection({
      type: "base",
      name: "content",
      fields: [
        { name: "canonical_url", type: "url", required: true },
        { name: "content_hash", type: "text", required: true },
        { name: "source_type", type: "text", required: true },
        { name: "title", type: "text" },
        { name: "author", type: "text" },
        { name: "site_name", type: "text" },
        { name: "lang", type: "text" },
        { name: "excerpt", type: "text" },
        { name: "content_html", type: "text" },
        { name: "content_text", type: "text" },
        { name: "word_count", type: "number" },
        { name: "read_time", type: "number" },
        { name: "hero_image", type: "text" },
        { name: "ai_tags_json", type: "json" },
        { name: "fetched_at", type: "text" },
        { name: "extract_status", type: "text", required: true },
        { name: "failure_reason", type: "text" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_content_canonical ON content (canonical_url)",
      ],
      // authenticated users may read; only superuser/worker token writes
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(content);

    // --- articles (per-user pointer) ---
    const articles = new Collection({
      type: "base",
      name: "articles",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
        { name: "content", type: "relation", collectionId: content.id, maxSelect: 1 },
        { name: "url", type: "url", required: true },
        { name: "status", type: "text", required: true },
        { name: "progress", type: "number" },
        { name: "is_private", type: "bool" },
      ],
      indexes: [
        "CREATE INDEX idx_articles_user ON articles (user)",
      ],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(articles);

    // --- jobs ---
    const jobs = new Collection({
      type: "base",
      name: "jobs",
      fields: [
        { name: "user", type: "text", required: true },
        { name: "canonical_url", type: "url", required: true },
        { name: "type", type: "text", required: true },
        { name: "status", type: "text", required: true },
        { name: "attempts", type: "number" },
        { name: "last_error", type: "text" },
        { name: "content", type: "text" },
        { name: "locked_at", type: "text" },
        { name: "locked_by", type: "text" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_jobs_url ON jobs (canonical_url)",
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(jobs);

    // --- tags ---
    const tags = new Collection({
      type: "base",
      name: "tags",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_tags_user_slug ON tags (user, slug)",
      ],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(tags);

    // --- article_tags ---
    const articleTags = new Collection({
      type: "base",
      name: "article_tags",
      fields: [
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "tag", type: "relation", required: true, collectionId: tags.id, maxSelect: 1 },
        { name: "source", type: "text", required: true },
        { name: "confidence", type: "number" },
      ],
      listRule: "article.user = @request.auth.id",
      viewRule: "article.user = @request.auth.id",
      createRule: "article.user = @request.auth.id",
      updateRule: "article.user = @request.auth.id",
      deleteRule: "article.user = @request.auth.id",
    });
    app.save(articleTags);

    // --- users extra fields ---
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ name: "tier", type: "text" }));
    users.fields.add(new Field({ name: "ai_provider", type: "text" }));
    users.fields.add(new Field({ name: "ai_key_enc", type: "text" }));
    users.fields.add(new Field({ name: "monthly_quota_used", type: "number" }));
    users.fields.add(new Field({ name: "quota_period", type: "text" }));
    app.save(users);
  },
  (app) => {
    for (const name of ["article_tags", "tags", "jobs", "articles", "content"]) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
