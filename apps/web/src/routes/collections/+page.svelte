<script lang="ts">
  import type { PageData } from "./$types";
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>collections</title></svelte:head>

<h1>collections</h1>

{#if data.collections.length === 0}
  <p class="empty-note">no collections yet. create one from the filters on your <a href="/library">library</a>.</p>
{:else}
  <div class="folder-grid">
    {#each data.collections as c (c.id)}
      <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
    {/each}
  </div>
{/if}

<style>
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }
  .folder-grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .empty-note { color: var(--color-text-muted); font-family: var(--font-ui); }
  .empty-note a { color: var(--color-accent); }
</style>
