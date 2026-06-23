<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<span class="tag">{@render children?.()}</span>

<style>
  .tag {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 0.8rem;
    color: var(--color-text-muted);
    border: 1px solid var(--color-fold);
    border-radius: var(--radius-pill);
    padding: 0.1rem 0.55rem;
  }
</style>
