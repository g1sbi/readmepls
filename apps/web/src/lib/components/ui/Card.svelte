<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">{@render children?.()}</div>

<style>
  .card {
    background: var(--paper-2);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    padding: 1rem;
  }
</style>
