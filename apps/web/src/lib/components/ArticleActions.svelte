<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Archive, Trash2, FolderPlus } from "@lucide/svelte";

  let {
    collections,
    onAddToCollection,
    onArchive,
    onDelete,
  }: {
    collections: { id: string; name: string }[];
    onAddToCollection: (id: string) => void;
    onArchive: () => void;
    onDelete: () => void;
  } = $props();
</script>

<div class="article-actions" role="group" aria-label="article actions">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          aria-label="add to collection"
          ><FolderPlus class="icon-md" aria-hidden="true" /></Button
        >
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start">
      <DropdownMenu.Label>add to collection</DropdownMenu.Label>
      {#if collections.length > 0}
        {#each collections as c (c.id)}
          <DropdownMenu.Item onSelect={() => onAddToCollection(c.id)}
            >{c.name}</DropdownMenu.Item
          >
        {/each}
      {:else}
        <div class="px-3 py-2 text-sm text-muted-foreground">
          no collections yet
        </div>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
  <button class="action-icon" onclick={onArchive} aria-label="archive article"
    ><Archive class="icon-md" aria-hidden="true" /></button
  >
  <button class="action-icon" onclick={onDelete} aria-label="delete article"
    ><Trash2 class="icon-md" aria-hidden="true" /></button
  >
</div>

<style>
  .article-actions {
    display: flex;
    gap: var(--space-2);
  }
  .action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      color var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out);
  }
  /* 44px touch targets — all three render together in the mobile "more" sheet. */
  .action-icon {
    width: 44px;
    height: 44px;
  }
  .action-icon:hover {
    color: var(--color-accent);
    box-shadow: var(--shadow-sm);
  }
  .action-icon:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
  }
  @media (prefers-reduced-motion: reduce) {
    .action-icon {
      transition: none;
    }
  }
</style>
