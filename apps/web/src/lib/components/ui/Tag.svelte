<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<span class="tag">{@render children?.()}</span>

<style>
  .tag {
    display: inline-block;
    font-family: var(--font-ui);
    color: var(--muted);
    border: 1px solid var(--fold);
    border-radius: var(--radius-sm);
    padding: 0.1rem 0.4rem;
  }
</style>
