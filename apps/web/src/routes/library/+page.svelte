<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Pencil, Trash2, Check, X, Plus } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { slugify } from "@readmepls/core";
  import { ClientResponseError } from "pocketbase";
  import type { ArticleRecord } from "$lib/article/record.js";
  import { deleteArticle } from "$lib/article/delete.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import Tag from "$lib/components/ui/Tag.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import PaperCorner from "$lib/components/ui/PaperCorner.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
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
  let newCollectionName = $state("");
  let renameTarget = $state<string | null>(null);
  let renameDraft = $state("");
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

  async function createCollection(e: SubmitEvent) {
    e.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    const slug = slugify(name);
    collectionError = "";
    try {
      await pb.collection("collections").create({
        user: uid, name, slug, parent: "", order: 0,
      });
      newCollectionName = "";
      collectionError = "";
      await loadCollections();
    } catch (err) {
      if (!(err instanceof ClientResponseError)) throw err;
      // Duplicate (user, slug) unique index → 400
      collectionError = "a collection with that name already exists";
    }
  }

  function startRename(id: string, currentName: string) {
    renameTarget = id;
    renameDraft = currentName;
  }

  async function submitRename(e: SubmitEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) return;
    // Use pb.filter binding for id — never raw interpolation
    await pb.collection("collections").update(renameTarget, {
      name, slug: slugify(name),
    });
    renameTarget = null;
    renameDraft = "";
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

{#if articleError}
  <p class="article-error" role="alert">{articleError}</p>
{/if}

{#if loading}
  <CardGrid>
    {#each Array(6) as _}
      <Card><Skeleton lines={3} /></Card>
    {/each}
  </CardGrid>
{:else if articles.length === 0}
  <div class="empty">
    <PaperCorner />
    <p>nothing saved yet. paste a link on the <a href="/">extract page</a> ☝</p>
  </div>
{:else}
  <CardGrid>
    {#each visible as a, i (a.id)}
      <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} onDelete={handleDelete} />
      </div>
    {/each}
  </CardGrid>
{/if}

<section class="collections-section">
  <h2 class="collections-heading">collections</h2>
  {#if collections.length > 0}
    <nav class="collections-rail" aria-label="Collections">
      {#each collections as col (col.id)}
        <div class="collection-item">
          {#if renameTarget === col.id}
            <form class="rename-form" onsubmit={submitRename}>
              <input
                aria-label="rename collection"
                bind:value={renameDraft}
                class="rename-input"
              />
              <button type="submit" class="action-btn"><Check class="icon-sm" aria-hidden="true" /> save</button>
              <button type="button" class="action-btn" onclick={() => (renameTarget = null)}><X class="icon-sm" aria-hidden="true" /> cancel</button>
            </form>
          {:else}
            <a class="collection-chip" href="/collections/{col.slug}"><Chip>{col.name}</Chip></a>
            <button class="action-btn" onclick={() => startRename(col.id, col.name)} aria-label="rename {col.name}"><Pencil class="icon-sm" aria-hidden="true" /></button>
            <button class="action-btn danger" onclick={() => deleteCollection(col.id)} aria-label="delete {col.name}"><Trash2 class="icon-sm" aria-hidden="true" /></button>
          {/if}
        </div>
      {/each}
    </nav>
  {/if}
  <form class="new-collection-form" onsubmit={createCollection}>
    <input
      aria-label="new collection name"
      placeholder="new collection…"
      bind:value={newCollectionName}
      class="new-collection-input"
    />
    <button type="submit" class="action-btn"><Plus class="icon-sm" aria-hidden="true" /> create</button>
  </form>
  {#if collectionError}
    <p class="collection-error" role="alert">{collectionError}</p>
  {/if}
</section>

<style>
  h1 { font-family: var(--font-ui); color: var(--color-text); font-size: 1.6rem; margin: 0 0 1.25rem; }
  .empty {
    text-align: center; padding: 3rem 1rem; background: var(--color-surface);
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

  .collections-section { margin-top: 2rem; }
  .collections-heading { font-family: var(--font-ui); color: var(--color-text); font-size: 1.1rem; margin: 0 0 0.75rem; }
  .collections-rail { display: flex; flex-direction: column; gap: 0.4rem; margin: 0 0 0.75rem; }
  .collection-item { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .collection-chip { text-decoration: none; }
  .collection-chip:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .action-btn {
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: none; border: none; cursor: pointer; font: inherit; font-size: var(--text-sm);
    color: var(--color-text-muted); padding: 0.1rem 0.4rem;
  }
  .action-btn:hover { color: var(--color-text); }
  .action-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .action-btn.danger:hover { color: var(--color-accent); }
  .rename-form { display: flex; align-items: center; gap: 0.4rem; }
  .rename-input, .new-collection-input {
    border: none; border-bottom: 1px solid var(--color-border);
    background: transparent; font: inherit; font-size: var(--text-sm); color: var(--color-text);
  }
  .new-collection-form { display: flex; align-items: center; gap: 0.5rem; }
  .collection-error { margin: 0.3rem 0 0; font-size: var(--text-sm); color: var(--color-accent); }
  .article-error { margin: 0 0 0.75rem; font-size: var(--text-sm); color: var(--color-accent); }
</style>
