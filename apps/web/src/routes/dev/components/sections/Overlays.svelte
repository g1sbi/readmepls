<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Command from "$lib/components/ui/command";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";

  // Overlays portal to <body>, so they take the page-level theme (the toggle
  // at the top of the sheet), not the frame they were opened from.
  let confirmOpen = $state(false);
  let bottomOpen = $state(false);
  let commandOpen = $state(false);
</script>

<div class="flex flex-wrap gap-2">
  <Dialog.Root>
    <Dialog.Trigger>
      {#snippet child({ props })}
        <Button variant="outline" {...props}>Dialog</Button>
      {/snippet}
    </Dialog.Trigger>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Rename collection</Dialog.Title>
        <Dialog.Description>
          Pick a short name you will recognise later.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Dialog.Close>
          {#snippet child({ props })}
            <Button {...props}>Save</Button>
          {/snippet}
        </Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>

  <Button variant="outline" onclick={() => (confirmOpen = true)}>
    Confirm action
  </Button>
  <ConfirmAction
    open={confirmOpen}
    title="Delete this article?"
    message="This removes it from your library. You can't undo this."
    onConfirm={() => (confirmOpen = false)}
    onCancel={() => (confirmOpen = false)}
  />

  {#each ["right", "bottom"] as const as side (side)}
    <Sheet.Root>
      <Sheet.Trigger>
        {#snippet child({ props })}
          <Button variant="outline" {...props}>Sheet {side}</Button>
        {/snippet}
      </Sheet.Trigger>
      <Sheet.Content {side}>
        <Sheet.Header>
          <Sheet.Title>Filters</Sheet.Title>
          <Sheet.Description>Narrow your library.</Sheet.Description>
        </Sheet.Header>
      </Sheet.Content>
    </Sheet.Root>
  {/each}

  <Button variant="outline" onclick={() => (bottomOpen = true)}>
    Bottom sheet
  </Button>
  <BottomSheet
    open={bottomOpen}
    onClose={() => (bottomOpen = false)}
    title="Add to collection"
  >
    <p class="text-muted-foreground text-sm">Drag down or tap close.</p>
  </BottomSheet>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button variant="outline" {...props}>Dropdown menu</Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
      <DropdownMenu.Item>Archive</DropdownMenu.Item>
      <DropdownMenu.Item>Add to collection</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item variant="destructive">Delete</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  <Button variant="outline" onclick={() => (commandOpen = true)}>
    Command palette
  </Button>
  <Command.Dialog bind:open={commandOpen}>
    <Command.Input placeholder="Search or jump to…" />
    <Command.List>
      <Command.Empty>No results.</Command.Empty>
      <Command.Group heading="Go to">
        <Command.Item>Library</Command.Item>
        <Command.Item>Collections</Command.Item>
        <Command.Item>Settings</Command.Item>
      </Command.Group>
    </Command.List>
  </Command.Dialog>
</div>
