<!-- apps/web/src/routes/library/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import type { PageData } from "./$types";
  import type { LibraryParams, Sort } from "@readmepls/types";
  import { serializeLibraryParams, slugify, type SourceFacet } from "@readmepls/core";
  import { ClientResponseError } from "pocketbase";
  import { applyPatch } from "$lib/library/url-state.js";
  import { browserPb } from "$lib/pb.js";
  import { deleteArticle } from "$lib/article/delete.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import PaperCorner from "$lib/components/ui/PaperCorner.svelte";
  import LibraryToolbar from "$lib/components/LibraryToolbar.svelte";
  import ActiveFilters from "$lib/components/ActiveFilters.svelte";
  import FilterDrawer from "$lib/components/FilterDrawer.svelte";
  import LibraryCollections from "$lib/components/LibraryCollections.svelte";
  import { reveal } from "$lib/actions/reveal.js";

  let { data }: { data: PageData } = $props();
  let drawerOpen = $state(false);
  let articleError = $state("");

  // Collection CRUD error — separate from article errors; surfaced inside FilterDrawer's
  // CollectionsPanel section, cleared on each create attempt.
  let collectionError = $state("");

  const pb = browserPb();

  // Per-article actions: mutate then invalidate so the server load re-runs and
  // the grid reflects the change (same refresh path as realtime).
  async function archiveArticle(id: string) { await pb.collection("articles").update(id, { status: "archived" }); await invalidateAll(); }
  async function unarchiveArticle(id: string) { await pb.collection("articles").update(id, { status: "unread" }); await invalidateAll(); }
  async function addToCollection(articleId: string, collectionId: string) {
    await pb.collection("collection_items").create({ collection: collectionId, article: articleId, order: 0 });
  }
  async function handleDelete(id: string) {
    articleError = "";
    try { await deleteArticle(pb, id); await invalidateAll(); }
    catch { articleError = "couldn't delete that. try again."; }
  }
  async function toggleFavorite(facet: SourceFacet) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    if (facet.favorite) {
      const row = await pb.collection("source_favorites").getFirstListItem(pb.filter("source = {:s}", { s: facet.id }));
      await pb.collection("source_favorites").delete(row.id);
    } else {
      await pb.collection("source_favorites").create({ user: uid, source: facet.id });
    }
    await invalidateAll();
  }

  // Collection CRUD — a different feature from collection *filtering* (FilterDrawer's
  // "collections" fieldset above). Mutates then invalidates so `data.facets.collections`
  // refreshes via the server load instead of a manual re-fetch.
  async function createCollection(name: string) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    const slug = slugify(name);
    collectionError = "";
    try {
      await pb.collection("collections").create({ user: uid, name, slug, parent: "", order: 0 });
      await invalidateAll();
    } catch (err) {
      if (!(err instanceof ClientResponseError)) throw err;
      // Duplicate (user, slug) unique index → 400
      collectionError = "a collection with that name already exists";
    }
  }
  async function renameCollection(id: string, name: string) {
    await pb.collection("collections").update(id, { name, slug: slugify(name) });
    await invalidateAll();
  }
  async function deleteCollection(id: string) {
    // collection_items cascade per Task 3 migration (cascadeDelete: true)
    await pb.collection("collections").delete(id);
    await invalidateAll();
  }

  const labels = $derived({
    tag: Object.fromEntries(data.facets.tags.map((t) => [t.id, t.name])),
    collection: Object.fromEntries(data.facets.collections.map((c) => [c.id, c.name])),
    source: Object.fromEntries(data.facets.options.sources.map((s) => [s.id, s.name ?? s.host])),
  });

  function navigate(next: LibraryParams) {
    const qs = serializeLibraryParams(next).toString();
    goto(qs ? `/library?${qs}` : "/library", { keepFocus: true, noScroll: true });
  }
  const patch = (p: Partial<LibraryParams>) => navigate(applyPatch(data.params, p));
  const clearAll = () => navigate({ ...data.params, read: [], time: [], tag: [], collection: [], source: [], favsrc: false, saved: null, published: null, lang: [], author: [], has: [], attention: [], q: "", page: 1 });

  // New captures should surface without a manual reload.
  let unsub: (() => void) | undefined;
  onMount(async () => { unsub = await pb.collection("articles").subscribe("*", () => invalidateAll()); });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

<LibraryCollections
  collections={data.facets.collections}
  error={collectionError}
  onCreate={createCollection}
/>

{#if articleError}
  <p class="article-error" role="alert">{articleError}</p>
{/if}

<LibraryToolbar
  params={data.params}
  total={data.page.totalItems}
  focusSearch={data.focusSearch}
  onSearch={(q) => patch({ q })}
  onSort={(s: Sort) => patch({ sort: s })}
  onOpenFilters={() => (drawerOpen = true)}
/>
<ActiveFilters params={data.params} {labels} onRemove={patch} onClear={clearAll} />
<FilterDrawer
  open={drawerOpen}
  onClose={() => (drawerOpen = false)}
  params={data.params}
  options={data.facets.options}
  tags={data.facets.tags}
  collections={data.facets.collections}
  onChange={patch}
  onToggleFavorite={toggleFavorite}
  {collectionError}
  onCreateCollection={createCollection}
  onRenameCollection={renameCollection}
  onDeleteCollection={deleteCollection}
/>

{#if data.page.items.length === 0}
  <div class="empty">
    <PaperCorner />
    <p>nothing matches those filters. <button class="link" onclick={clearAll}>clear filters</button> or save a link on your <a href="/">home page</a>.</p>
  </div>
{:else}
  <CardGrid>
    {#each data.page.items as a, i (a.id)}
      {@const article = a as ArticleRecord}
      <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
        <ArticleCard
          {article}
          collections={data.facets.collections}
          onAddToCollection={addToCollection}
          onArchive={archiveArticle}
          onUnarchive={unarchiveArticle}
          onDelete={handleDelete}
        />
      </div>
    {/each}
  </CardGrid>

  {#if data.page.totalItems > data.page.perPage}
    <nav class="pager" aria-label="library pagination">
      <button disabled={data.page.page <= 1} onclick={() => patch({ page: data.page.page - 1 })}>← prev</button>
      <span>page {data.page.page} of {Math.max(1, Math.ceil(data.page.totalItems / data.page.perPage))}</span>
      <button disabled={data.page.page * data.page.perPage >= data.page.totalItems} onclick={() => patch({ page: data.page.page + 1 })}>next →</button>
    </nav>
  {/if}
{/if}

<style>
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }
  .empty { text-align: center; padding: var(--space-7) var(--space-4); background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); position: relative; overflow: hidden; }
  .empty p { font-family: var(--font-ui); color: var(--color-text-muted); }
  .empty a, .link { color: var(--color-accent); }
  .link { background: none; border: none; cursor: pointer; font: inherit; padding: 0; }
  .article-error { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--color-accent); }
  .pager { display: flex; align-items: center; justify-content: center; gap: var(--space-4); margin: var(--space-6) 0; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); }
  .pager button { background: none; border: none; cursor: pointer; font: inherit; color: var(--color-accent); padding: 0; }
  .pager button:disabled { opacity: 0.4; cursor: not-allowed; color: var(--color-text-muted); }
</style>
