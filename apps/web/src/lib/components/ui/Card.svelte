<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">{@render children?.()}</div>

<style>
  .card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0; /* allow flex/grid children to shrink so long content wraps */
    background: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 1.1rem 1.2rem;
  }
  .card::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: var(--grain-opacity); mix-blend-mode: multiply;
    border-radius: inherit;
  }
</style>
