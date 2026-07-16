<!-- Global ⌘K search command palette. Composes the generated shadcn-svelte
     dialog + command primitives (CLAUDE.md: new interactive primitives go
     through shadcn-svelte, not a direct bits-ui import). No props — it is
     entirely driven by the `searchPalette` store so any part of the app can
     open it with `searchPalette.open(seedQuery?)`. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import { goto } from "$app/navigation";
  import type { LiveSearchResult } from "@readmepls/types";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import { fetchLive } from "$lib/search/live-client.js";
  import { loadRecentSearches, pushRecentSearch } from "$lib/search/recent-searches.js";
  import { browserPb } from "$lib/pb.js";
  import { sourceView } from "$lib/source/source-view.js";
  import type { ArticleRecord } from "$lib/article/record.js";

  const EMPTY: LiveSearchResult = { articles: [], tags: [], collections: [] };
  const DEBOUNCE_KEYWORD = 120;
  const DEBOUNCE_HYBRID = 250;

  let query = $state("");
  let results = $state<LiveSearchResult>(EMPTY);
  let recent = $state<string[]>([]);
  let recentArticles = $state<ArticleRecord[]>([]);

  // One AbortController per phase, not a single shared one: the hybrid
  // phase's request must never abort a still-in-flight keyword request (or
  // vice versa) — only a newer request within the *same* phase should
  // cancel an older one. Recreated per query-change cycle and aborted on
  // the debounce effect's cleanup, same as the timers below.
  let kwController: AbortController | undefined;
  let hyController: AbortController | undefined;

  const pb = browserPb();

  // Seed from the store each time the palette opens; tear down in-flight work
  // (timers via the debounce effect's own cleanup, network via abort) on close.
  $effect(() => {
    if (searchPalette.isOpen) {
      query = searchPalette.initialQuery;
      recent = loadRecentSearches();
      loadRecentlyRead();
    } else {
      reset();
    }
  });

  // Two-phase debounced search, keyed off `query` alone so it re-runs for
  // typing, clicking a recent search, and the initial store-seeded value
  // alike. Svelte's effect cleanup cancels the previous cycle's timers
  // automatically whenever `query` changes again (or the component closes).
  $effect(() => {
    const q = query;
    if (!q.trim()) {
      results = EMPTY;
      return;
    }
    const kwTimer = setTimeout(() => runSearch(q, "keyword"), DEBOUNCE_KEYWORD);
    const hyTimer = setTimeout(() => runSearch(q, "hybrid"), DEBOUNCE_HYBRID);
    return () => {
      clearTimeout(kwTimer);
      clearTimeout(hyTimer);
      kwController?.abort();
      hyController?.abort();
    };
  });

  async function loadRecentlyRead() {
    try {
      const list = await pb.collection("articles").getList(1, 5, {
        sort: "-updated",
        expand: "content.source",
        requestKey: null,
      });
      recentArticles = list.items as unknown as ArticleRecord[];
    } catch {
      recentArticles = [];
    }
  }

  function reset() {
    query = "";
    results = EMPTY;
    kwController?.abort();
    hyController?.abort();
  }

  // Phase-1 keyword shows fast; phase-2 hybrid replaces in place. Each phase
  // aborts only its own previous in-flight request (a newer keystroke's
  // keyword call cancels a stale keyword call, never a hybrid call and vice
  // versa) so the hybrid phase can't cancel a still-in-flight keyword
  // request from the same keystroke.
  async function runSearch(q: string, mode: "keyword" | "hybrid") {
    const abortController = new AbortController();
    if (mode === "keyword") {
      kwController?.abort();
      kwController = abortController;
    } else {
      hyController?.abort();
      hyController = abortController;
    }
    try {
      const r = await fetchLive(q, mode, abortController.signal);
      if (q === query) results = r;
    } catch {
      /* aborted or failed — keep the last good results */
    }
  }

  const totalArticles = $derived(results.articles.length);

  function pickArticle(id: string) {
    pushRecentSearch(query);
    close();
    goto(`/read/${id}`);
  }
  function pickTag(id: string) {
    close();
    goto(`/library?tag=${id}`);
  }
  function pickCollection(id: string) {
    close();
    goto(`/library?collection=${id}`);
  }
  function seeAll() {
    const q = query.trim();
    pushRecentSearch(q);
    close();
    goto(`/library?q=${encodeURIComponent(q)}`);
  }
  function reRun(q: string) {
    query = q;
  }
  function close() {
    searchPalette.close();
  }
</script>

<Dialog.Root open={searchPalette.isOpen} onOpenChange={(v) => { if (!v) close(); }}>
  <Dialog.Content showCloseButton={false} class="sp-content">
    <Dialog.Header class="sr-only">
      <Dialog.Title>search</Dialog.Title>
      <Dialog.Description>search your library</Dialog.Description>
    </Dialog.Header>
    <Command.Root shouldFilter={false} class="sp-command">
      <Command.Input placeholder="search your library…" bind:value={query} autofocus />
      <Command.List class="sp-list">
        {#if !query.trim()}
          {#if recent.length}
            <Command.Group heading="recent searches">
              {#each recent as r (r)}
                <Command.Item onSelect={() => reRun(r)}>{r}</Command.Item>
              {/each}
            </Command.Group>
          {/if}
          {#if recentArticles.length}
            <Command.Group heading="recently read">
              {#each recentArticles as a (a.id)}
                {@const source = sourceView(pb, a.expand?.content)}
                <Command.Item onSelect={() => pickArticle(a.id)}>
                  <span class="sp-title">{a.expand?.content?.title ?? a.url}</span>
                  {#if source}<span class="sp-source">{source.name ?? source.host}</span>{/if}
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
        {:else}
          {#if results.articles.length}
            <Command.Group heading="articles">
              {#each results.articles as a (a.id)}
                <Command.Item onSelect={() => pickArticle(a.id)}>
                  <span class="sp-title">{a.title}</span>
                  {#if a.sourceName}<span class="sp-source">{a.sourceName}</span>{/if}
                  {#if a.snippet}<span class="sp-snippet">{a.snippet}</span>{/if}
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          {#if results.tags.length}
            <Command.Group heading="tags">
              {#each results.tags as t (t.id)}
                <Command.Item onSelect={() => pickTag(t.id)}>
                  <span aria-hidden="true">#</span><span class="sp-title">{t.name}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          {#if results.collections.length}
            <Command.Group heading="collections">
              {#each results.collections as c (c.id)}
                <Command.Item onSelect={() => pickCollection(c.id)}>{c.name}</Command.Item>
              {/each}
            </Command.Group>
          {/if}
          <Command.Item class="sp-seeall" onSelect={seeAll}>
            ↵ see all {totalArticles ? `${totalArticles}+ ` : ""}results →
          </Command.Item>
        {/if}
      </Command.List>
    </Command.Root>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Structural overrides beat the generated ui/dialog + ui/command Tailwind
     defaults (centered small modal, 18rem list) with the mobile-first sheet
     shape this feature needs. Colors/fonts/radii/spacing all reference
     tokens.css — never hardcoded. */
  :global(.sp-content) {
    left: 50% !important;
    top: 12vh !important;
    transform: translateX(-50%) !important;
    translate: none !important;
    width: min(40rem, 92vw) !important;
    max-width: none !important;
    max-height: 70vh !important;
    height: auto !important;
    overflow: hidden !important;
    padding: 0 !important;
    gap: 0 !important;
    border-radius: var(--radius-xl) !important;
    border: 1px solid var(--color-border) !important;
    background: var(--color-surface);
  }
  :global(.sp-command) {
    border-radius: 0 !important;
    padding: 0 !important;
  }
  :global(.sp-content) :global([data-slot="command-input-wrapper"]) {
    padding: var(--space-2) var(--space-3) !important;
    border-bottom: 1px solid var(--color-border);
  }
  :global(.sp-content) :global([data-slot="command-input"]) {
    min-height: 44px;
    font-family: var(--font-ui);
    font-size: var(--text-md);
    color: var(--color-text);
  }
  :global(.sp-list) {
    max-height: calc(70vh - 4rem) !important;
    overflow-y: auto !important;
    padding: var(--space-2) !important;
  }
  :global(.sp-content) :global([data-slot="command-item"]) {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
    min-height: 44px;
    /* !important beats the generated command-item's own
       in-data-[slot=dialog-content]:rounded-lg! (also !important), which
       would otherwise win and render a 20px pill instead of this row's
       tighter, proportionate corner. */
    border-radius: var(--radius-sm) !important;
    font-family: var(--font-ui);
    color: var(--color-text);
    cursor: pointer;
  }
  :global(.sp-content) :global([data-slot="command-group-heading"]) {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sp-title {
    font-weight: var(--weight-medium);
  }
  .sp-source {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
  .sp-snippet {
    flex-basis: 100%;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.sp-seeall) {
    color: var(--color-accent) !important;
  }

  @media (max-width: 640px) {
    :global(.sp-content) {
      left: 0 !important;
      top: 0 !important;
      transform: none !important;
      translate: none !important;
      width: 100vw !important;
      max-height: 100dvh !important;
      height: 100dvh !important;
      border: none !important;
      border-radius: 0 !important;
    }
    :global(.sp-list) {
      max-height: calc(100dvh - 4rem) !important;
    }
  }
</style>
