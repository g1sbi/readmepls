<script lang="ts">
  import type { LibraryParams, Sort } from "@readmepls/types";
  import { SlidersHorizontal } from "@lucide/svelte";
  import { untrack } from "svelte";

  let { params, total, focusSearch = false, onSearch, onSort, onOpenFilters }: {
    params: LibraryParams; total: number; focusSearch?: boolean;
    onSearch: (q: string) => void; onSort: (s: Sort) => void; onOpenFilters: () => void;
  } = $props();

  let query = $state(untrack(() => params.q));
  $effect(() => { query = params.q; });

  let searchEl = $state<HTMLInputElement | null>(null);
  $effect(() => { if (focusSearch) searchEl?.focus(); });

  const SORT_LABELS: { value: Sort; label: string }[] = [
    { value: "-created", label: "newest saved" },
    { value: "created", label: "oldest saved" },
    { value: "-published", label: "recently published" },
    { value: "-read_time", label: "longest" },
    { value: "read_time", label: "shortest" },
    { value: "-updated", label: "recently read" },
    { value: "title", label: "title a–z" },
    { value: "relevance", label: "relevance" },
  ];
</script>

<div class="toolbar">
  <input
    class="search"
    type="search"
    aria-label="search your library"
    placeholder="search…"
    bind:this={searchEl}
    bind:value={query}
    onkeydown={(e) => { if (e.key === "Enter") onSearch(query.trim()); }}
  />
  <button class="filters-btn" onclick={onOpenFilters}>
    <SlidersHorizontal class="icon-sm" aria-hidden="true" /> filters
  </button>
  <label class="sort">
    <span class="sr-only">sort</span>
    <select aria-label="sort" value={params.sort} onchange={(e) => onSort(e.currentTarget.value as Sort)}>
      {#each SORT_LABELS as s (s.value)}
        {#if s.value !== "relevance" || params.q}
          <option value={s.value}>{s.label}</option>
        {/if}
      {/each}
    </select>
  </label>
  <span class="count">{total} article{total === 1 ? "" : "s"}</span>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin: 0 0 var(--space-4); }
  .search { flex: 1 1 12rem; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-ui); color: var(--color-text); }
  .filters-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); cursor: pointer; font-family: var(--font-ui); color: var(--color-text); }
  .filters-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
  select { padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-ui); color: var(--color-text); }
  .count { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); margin-left: auto; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  @media (max-width: 640px) {
    .search { flex-basis: 100%; order: 1; min-height: 44px; }
    .filters-btn { order: 2; min-height: 44px; }
    .sort { order: 3; }
    select { min-height: 44px; }
    .count { order: 4; }
  }
</style>
