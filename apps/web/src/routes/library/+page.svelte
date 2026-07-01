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

  let visible = $derived(
    selectedTag === null ? articles : articles.filter((a) => taggedArticleIds.has(a.id)),
  );

  async function load() {
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content" });
    articles = list.items as ArticleRecord[];
    loading = false;
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

  onMount(async () => {
    await Promise.all([load(), loadTags(), loadCollections()]);
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

{#if articleError}
  <p class="article-error" role="alert">{articleError}</p>
{/if}

<div class="library-layout">
  <Rail label="filters and collections">
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
            <ArticleCard article={a} onDelete={handleDelete} />
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
</style>
