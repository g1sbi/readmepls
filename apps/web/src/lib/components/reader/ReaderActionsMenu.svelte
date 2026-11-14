<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import {
    MoreHorizontal,
    Folder,
    ExternalLink,
    Archive,
    Trash2,
  } from "@lucide/svelte";
  import type { CollectionSummary } from "$lib/collections/types.js";

  let {
    collections,
    originalUrl,
    onAddToCollection,
    onArchive,
    onDelete,
  }: {
    collections: CollectionSummary[];
    originalUrl: string | null;
    onAddToCollection: (id: string) => void;
    onArchive: () => void;
    onDelete: () => void;
  } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon-sm"
        aria-label="Article actions"
      >
        <MoreHorizontal class="icon-md" aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="min-w-56">
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading>Add to collection</DropdownMenu.GroupHeading>
      {#each collections as c (c.id)}
        <DropdownMenu.Item onSelect={() => onAddToCollection(c.id)}>
          <Folder class="icon-sm" aria-hidden="true" />
          {c.name}
          <span class="text-muted-foreground ml-auto text-xs tabular-nums"
            >{c.count}</span
          >
        </DropdownMenu.Item>
      {:else}
        <p class="text-muted-foreground px-3 py-2 text-sm">
          No collections yet
        </p>
      {/each}
    </DropdownMenu.Group>
    <DropdownMenu.Separator />
    {#if originalUrl}
      <DropdownMenu.Item
        onSelect={() =>
          window.open(originalUrl, "_blank", "noopener,noreferrer")}
      >
        <ExternalLink class="icon-sm" aria-hidden="true" />
        Open original
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Item onSelect={onArchive}>
      <Archive class="icon-sm" aria-hidden="true" />
      Archive
    </DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="destructive" onSelect={onDelete}>
      <Trash2 class="icon-sm" aria-hidden="true" />
      Delete
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
