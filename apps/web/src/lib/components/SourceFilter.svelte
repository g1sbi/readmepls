<script lang="ts">
  import Chip from "./ui/Chip.svelte";
  import { Star } from "@lucide/svelte";
  import { browserPb } from "$lib/pb.js";
  import type { SourceFacet } from "$lib/source/library-sources.js";

  let { facets, selected, onToggle, onToggleFavorite }: {
    facets: SourceFacet[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    onToggleFavorite: (facet: SourceFacet) => void;
  } = $props();

  const pb = browserPb();
  function iconUrl(f: SourceFacet): string | null {
    return f.favicon ? pb.files.getUrl({ id: f.id, favicon: f.favicon } as never, f.favicon) : null;
  }
</script>

{#if facets.length > 0}
  <nav class="source-filter" aria-label="Filter by source">
    <button class="chip-btn" aria-pressed={selected.size === 0} onclick={() => onToggle("__all__")}>
      <Chip selected={selected.size === 0}>all</Chip>
    </button>
    {#each facets as f (f.id)}
      <span class="source-chip">
        <button class="chip-btn" aria-pressed={selected.has(f.id)} onclick={() => onToggle(f.id)}>
          <Chip selected={selected.has(f.id)}>
            {#if iconUrl(f)}<img class="chip-favicon" src={iconUrl(f)} alt="" width="14" height="14" />{/if}
            {f.name || f.host}
            {#snippet trailing()}<span class="count">{f.count}</span>{/snippet}
          </Chip>
        </button>
        <button
          class="fav-btn"
          class:active={f.favorite}
          aria-label={f.favorite ? `unfavorite ${f.host}` : `favorite ${f.host}`}
          aria-pressed={f.favorite}
          onclick={() => onToggleFavorite(f)}
        >
          <Star class="icon-sm" aria-hidden="true" />
        </button>
      </span>
    {/each}
  </nav>
{/if}

<style>
  .source-filter { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.25rem; }
  .source-chip { display: inline-flex; align-items: center; gap: 0.15rem; }
  .chip-btn { background: none; border: none; padding: 0; cursor: pointer; }
  .chip-favicon { width: 0.9rem; height: 0.9rem; border-radius: var(--radius-sm); object-fit: contain; }
  .count { font-size: var(--text-xs); opacity: 0.7; }
  .fav-btn {
    background: none; border: none; cursor: pointer; padding: 0.1rem;
    color: var(--color-text-muted); display: inline-flex;
  }
  .fav-btn.active { color: var(--color-accent); }
  .fav-btn:hover { color: var(--color-accent); }
  .fav-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
</style>
