<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, selected = false, trailing }: {
    children: Snippet;
    selected?: boolean;
    trailing?: Snippet;
  } = $props();
</script>

<span class="chip" data-selected={selected}>
  {@render children()}
  {#if trailing}{@render trailing()}{/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: 0.1rem 0.6rem;
  }
  .chip[data-selected="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
  }
</style>
