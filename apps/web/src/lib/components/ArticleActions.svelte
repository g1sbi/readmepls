<script lang="ts">
  import DropdownMenu from "$lib/components/ui/DropdownMenu.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
  import { Archive, Trash2, FolderPlus } from "@lucide/svelte";

  let { collections, onAddToCollection, onArchive, onDelete }: {
    collections: { id: string; name: string }[];
    onAddToCollection: (id: string) => void;
    onArchive: () => void;
    onDelete: () => void;
  } = $props();
</script>

<div class="article-actions" role="group" aria-label="article actions">
  <DropdownMenu label="add to collection" align="start">
    {#snippet trigger()}<FolderPlus class="icon-md" aria-hidden="true" />{/snippet}
    <div class="menu-label">add to collection</div>
    {#if collections.length > 0}
      {#each collections as c (c.id)}
        <MenuItem onSelect={() => onAddToCollection(c.id)}>{c.name}</MenuItem>
      {/each}
    {:else}
      <div class="menu-empty">no collections yet</div>
    {/if}
  </DropdownMenu>
  <button class="action-icon" onclick={onArchive} aria-label="archive article"><Archive class="icon-md" aria-hidden="true" /></button>
  <button class="action-icon" onclick={onDelete} aria-label="delete article"><Trash2 class="icon-md" aria-hidden="true" /></button>
</div>

<style>
  .article-actions { display: flex; gap: var(--space-2); }
  .article-actions :global(.dropdown__trigger),
  .action-icon {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  /* 44px touch targets — all three render together in the mobile "more" sheet. */
  .article-actions :global(.dropdown__trigger),
  .action-icon { width: 44px; height: 44px; }
  .article-actions :global(.dropdown__trigger):hover,
  .action-icon:hover { color: var(--color-accent); box-shadow: var(--shadow-sm); }
  .article-actions :global(.dropdown__trigger):focus-visible,
  .action-icon:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) {
    .article-actions :global(.dropdown__trigger), .action-icon { transition: none; }
  }
</style>
