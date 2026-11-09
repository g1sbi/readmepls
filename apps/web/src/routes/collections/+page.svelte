<script lang="ts">
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import type { PageData } from "./$types";
  import { resolve } from "$app/paths";
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>collections</title></svelte:head>

<PageHeader title="Collections" />

{#if data.collections.length === 0}
  <p class="empty-note">
    no collections yet. create one from the filters on your <a
      href={resolve("/library")}>library</a
    >.
  </p>
{:else}
  <div class="folder-grid">
    {#each data.collections as c (c.id)}
      <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
    {/each}
  </div>
{/if}

<style>
  .folder-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .empty-note {
    color: var(--color-text-muted);
    font-family: var(--font-ui);
  }
  .empty-note a {
    color: var(--color-accent);
  }
</style>
