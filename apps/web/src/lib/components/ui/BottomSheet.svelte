<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Drawer from "$lib/components/ui/drawer";
  import { Button } from "$lib/components/ui/button";
  import XIcon from "@lucide/svelte/icons/x";
  let {
    open,
    onClose,
    title,
    count,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Shown beside the title, tabular — the highlights sheet counts its rows. */
    count?: number;
    children?: Snippet;
  } = $props();

  // Drawer.Content already composes its own Portal + Overlay + grab handle
  // (vaul-svelte), so wrapping it in another Portal/Overlay here would double
  // them up. Content is the single top-level unit to render.
  function onOpenChange(next: boolean) {
    if (!next) onClose();
  }
</script>

<Drawer.Root {open} {onOpenChange}>
  <Drawer.Content>
    <header class="flex items-center justify-between px-4 pb-2">
      <Drawer.Title
        class="text-foreground flex items-baseline gap-2 text-base font-medium"
      >
        {title}
        {#if count !== undefined}
          <span
            data-testid="sheet-count"
            class="text-muted-foreground text-sm font-normal tabular-nums"
            >{count}</span
          >
        {/if}
      </Drawer.Title>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onclick={onClose}
      >
        <XIcon />
      </Button>
    </header>
    <div class="overflow-y-auto px-4 pb-4">
      {#if children}{@render children()}{/if}
    </div>
  </Drawer.Content>
</Drawer.Root>
