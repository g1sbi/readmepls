<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children: Snippet } = $props();
</script>

<div class="grid">{@render children()}</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 1rem; }
  /* Propagate the stretched grid-item size down to the card inside any wrapper
     (e.g. the reveal <div>). A single grid child stretches on BOTH axes by default
     (grid align-items/justify-items default to stretch), fixing height AND width.
     :global() needed because children are rendered via {@render children()} and
     are outside Svelte's scoped-CSS view for this component. */
  .grid > :global(*) { display: grid; }
</style>
