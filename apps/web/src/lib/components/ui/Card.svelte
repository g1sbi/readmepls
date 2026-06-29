<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">{@render children?.()}</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0; /* allow flex/grid children to shrink so long content wraps */
    background: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: 1.1rem 1.2rem;
  }
</style>
