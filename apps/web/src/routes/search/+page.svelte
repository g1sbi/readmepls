<script lang="ts">
  import { page } from "$app/stores";
  import { SearchResult } from "@readmepls/types";
  import { z } from "zod";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import { browserPb } from "$lib/pb";
  import { publicPbUrl } from "$lib/public-pb-url";

  let results = $state<z.infer<typeof SearchResult>[]>([]);
  let loading = $state(false);
  let q = $derived($page.url.searchParams.get("q") ?? "");

  const Resp = z.object({ results: z.array(SearchResult) });

  $effect(() => {
    const query = q;
    if (!query.trim()) { results = []; return; }
    loading = true;
    const base = publicPbUrl();
    fetch(`${base}/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: browserPb().authStore.token },
    })
      .then((r) => r.json())
      .then((j) => { results = Resp.parse(j).results; })
      .catch(() => { results = []; })
      .finally(() => { loading = false; });
  });
</script>

<svelte:head><title>search · {q}</title></svelte:head>

<section class="search-results">
  <h1>results for "{q}"</h1>
  {#if loading}
    <p class="status">searching…</p>
  {:else if results.length === 0}
    <p class="empty">nothing found{q ? ` for "${q}"` : ""}.</p>
  {:else}
    <CardGrid>
      {#each results as r (r.articleId)}
        <a class="result" href={`/read/${r.articleId}`}>
          <h2>{r.title}</h2>
          <p class="snippet">{@html r.snippet}</p>
        </a>
      {/each}
    </CardGrid>
  {/if}
</section>

<style>
  .search-results {
    max-width: var(--width-prose);
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
  h1 {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    color: var(--color-text);
    margin-bottom: var(--space-5);
  }
  .status, .empty { color: var(--color-text-muted); font-family: var(--font-display); }
  .result {
    display: block;
    text-decoration: none;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    transition: box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  }
  .result:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-md);
  }
  .result h2 {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    margin: 0 0 var(--space-2);
    color: var(--color-text);
  }
  .snippet {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    line-height: var(--leading-ui);
  }
  .snippet :global(mark) {
    background: var(--hl-amber);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
</style>
