<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browserPb } from "$lib/pb.js";
  import { slugify } from "@readmepls/core";
  import { ClientResponseError } from "pocketbase";
  import type { ArticleRecord } from "$lib/article/record.js";
  import { deleteArticle } from "$lib/article/delete.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import Tag from "$lib/components/ui/Tag.svelte";
  import PaperCorner from "$lib/components/ui/PaperCorner.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import Rail from "$lib/components/ui/Rail.svelte";
  import CollectionsPanel from "$lib/components/CollectionsPanel.svelte";
  import SourceFilter from "$lib/components/SourceFilter.svelte";
  import { deriveLibrarySources, filterBySources, type SourceFacet } from "$lib/source/library-sources.js";
  import { reveal } from "$lib/actions/reveal.js";

  const pb = browserPb();
  let articles = $state<ArticleRecord[]>([]);
  let loading = $state(true);
  let unsub: (() => void) | undefined;

  // Tag rail state
  let tags = $state<{ id: string; name: string }[]>([]);
  let selectedTag = $state<string | null>(null);
  let taggedArticleIds = $state<Set<string>>(new Set());

  // Collections state
  let collections = $state<{ id: string; name: string; slug: string }[]>([]);
  let collectionError = $state("");

  // Article delete error — cleared on each attempt, shown inline if delete fails
  let articleError = $state("");

  // Archived view toggle — library shows non-archived by default.
  let archived = $state(false);

  // Source filter state
  let selectedSources = $state<Set<string>>(new Set());
  let favoriteSourceIds = $state<Set<string>>(new Set());

  let sourceFacets = $derived<SourceFacet[]>(deriveLibrarySources(articles, favoriteSourceIds));
  let visible = $derived(
    filterBySources(
      selectedTag === null ? articles : articles.filter((a) => taggedArticleIds.has(a.id)),
      selectedSources,
    ),
  );

  async function load() {
    const filter = archived
      ? pb.filter("status = {:s}", { s: "archived" })
      : pb.filter("status != {:s}", { s: "archived" });
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content.source", filter });
    articles = list.items as ArticleRecord[];
    loading = false;
  }

  async function toggleArchived() {
    archived = !archived;
    loading = true;
    await load();
  }

  async function addToCollection(articleId: string, collectionId: string) {
    await pb.collection("collection_items").create({ collection: collectionId, article: articleId, order: 0 });
  }

  async function archiveArticle(id: string) {
    await pb.collection("articles").update(id, { status: "archived" });
    await load();
  }

  async function unarchiveArticle(id: string) {
    await pb.collection("articles").update(id, { status: "unread" });
    await load();
  }

  async function loadTags() {
    const raw = await pb.collection("tags").getFullList({ sort: "name" });
    tags = raw.map((t) => ({ id: t.id, name: t.name as string }));
  }

  async function loadCollections() {
    const raw = await pb.collection("collections").getFullList({ sort: "name" });
    collections = raw.map((c) => ({ id: c.id, name: c.name as string, slug: c.slug as string }));
  }

  async function selectTag(tagId: string | null) {
    selectedTag = tagId;
    if (tagId === null) {
      taggedArticleIds = new Set();
      return;
    }
    // Use pb.filter binding to prevent injection — never raw string interpolation.
    const links = await pb
      .collection("article_tags")
      .getFullList({ filter: pb.filter("tag = {:tagId}", { tagId }) });
    taggedArticleIds = new Set(links.map((l) => l.article as string));
  }

  async function createCollection(name: string) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    const slug = slugify(name);
    collectionError = "";
    try {
      await pb.collection("collections").create({ user: uid, name, slug, parent: "", order: 0 });
      await loadCollections();
    } catch (err) {
      if (!(err instanceof ClientResponseError)) throw err;
      // Duplicate (user, slug) unique index → 400
      collectionError = "a collection with that name already exists";
    }
  }

  async function renameCollection(id: string, name: string) {
    await pb.collection("collections").update(id, { name, slug: slugify(name) });
    await loadCollections();
  }

  async function handleDelete(id: string) {
    articleError = "";
    try {
      await deleteArticle(pb, id);
      // grid refreshes via the existing articles realtime subscription
    } catch {
      articleError = "couldn't delete that. try again.";
    }
  }

  async function deleteCollection(id: string) {
    // collection_items cascade per Task 3 migration (cascadeDelete: true)
    await pb.collection("collections").delete(id);
    await loadCollections();
  }

  function toggleSource(id: string) {
    if (id === "__all__") { selectedSources = new Set(); return; }
    const next = new Set(selectedSources);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedSources = next;
  }

  async function loadFavorites() {
    const rows = await pb.collection("source_favorites").getFullList();
    favoriteSourceIds = new Set(rows.map((r) => r.source as string));
  }

  async function toggleFavorite(facet: SourceFacet) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    if (favoriteSourceIds.has(facet.id)) {
      const row = await pb.collection("source_favorites").getFirstListItem(
        pb.filter("source = {:s}", { s: facet.id }),
      );
      await pb.collection("source_favorites").delete(row.id);
    } else {
      await pb.collection("source_favorites").create({ user: uid, source: facet.id });
    }
    await loadFavorites();
  }

  onMount(async () => {
    await Promise.all([load(), loadTags(), loadCollections(), loadFavorites()]);
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content.source" });
  });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

{#if articleError}
  <p class="article-error" role="alert">{articleError}</p>
{/if}

<div class="library-layout">
  <Rail label="filters and collections">
    <SourceFilter
      facets={sourceFacets}
      selected={selectedSources}
      onToggle={toggleSource}
      onToggleFavorite={toggleFavorite}
    />
    {#if tags.length > 0}
      <nav class="tag-rail" aria-label="Filter by tag">
        <button
          class="tag-chip"
          class:selected={selectedTag === null}
          onclick={() => selectTag(null)}
          aria-pressed={selectedTag === null}
        >
          <Tag>all</Tag>
        </button>
        {#each tags as t (t.id)}
          <button
            class="tag-chip"
            class:selected={selectedTag === t.id}
            onclick={() => selectTag(t.id)}
            aria-pressed={selectedTag === t.id}
          >
            <Tag>{t.name}</Tag>
          </button>
        {/each}
      </nav>
    {/if}
    <button
      class="tag-chip archived-toggle"
      class:selected={archived}
      aria-pressed={archived}
      onclick={toggleArchived}
    >
      <Tag>archived</Tag>
    </button>
    <CollectionsPanel
      {collections}
      error={collectionError}
      oncreate={createCollection}
      onrename={renameCollection}
      ondelete={deleteCollection}
    />
  </Rail>

  <div class="library-main">
    {#if loading}
      <CardGrid>
        {#each Array(6) as _}
          <Card><Skeleton lines={3} /></Card>
        {/each}
      </CardGrid>
    {:else if articles.length === 0}
      <div class="empty">
        <PaperCorner />
        <p>nothing saved yet. paste a link on your <a href="/">home page</a> ☝</p>
      </div>
    {:else}
      <CardGrid>
        {#each visible as a, i (a.id)}
          <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
            <ArticleCard
              article={a}
              {collections}
              onAddToCollection={addToCollection}
              onArchive={archiveArticle}
              onUnarchive={unarchiveArticle}
              onDelete={handleDelete}
            />
          </div>
        {/each}
      </CardGrid>
    {/if}
  </div>
</div>

<style>
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }

  .library-layout { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  @media (min-width: 1024px) {
    .library-layout { grid-template-columns: 16rem minmax(0, 1fr); align-items: start; }
  }
  .library-main { min-width: 0; }

  .empty {
    text-align: center; padding: var(--space-7) var(--space-4); background: var(--color-surface);
    border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
  }
  .empty p { font-family: var(--font-ui); color: var(--color-text-muted); }
  .empty a { color: var(--color-accent); }

  .tag-rail {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 1.25rem;
  }
  .tag-chip {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tag-chip:hover :global(.chip) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .tag-chip:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .tag-chip.selected :global(.chip) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
  }

  .article-error { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--color-accent); }

  .archived-toggle { margin: 0.25rem 0 1.25rem; }
</style>
