/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const articles = app.findCollectionByNameOrId("articles");
    articles.fields.add(new Field({ name: "canonical_url", type: "text" }));
    articles.indexes.push(
      "CREATE INDEX idx_articles_canonical ON articles (canonical_url)"
    );
    app.save(articles);

    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new Field({ name: "reader_prefs", type: "json" }));
    app.save(users);
  },
  (app) => {
    const articles = app.findCollectionByNameOrId("articles");
    articles.fields.removeByName("canonical_url");
    articles.indexes = articles.indexes.filter(
      (i) => !i.includes("idx_articles_canonical")
    );
    app.save(articles);

    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("reader_prefs");
    app.save(users);
  }
);
