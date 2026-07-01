<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, label }: { children: Snippet; label?: string } = $props();
</script>

<aside class="rail" aria-label={label}>{@render children()}</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }
  @media (min-width: 1024px) {
    .rail { position: sticky; top: var(--space-4); align-self: start; }
  }
</style>
