<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet";
  import type { Highlight } from "@readmepls/types";
  import HighlightList from "./HighlightList.svelte";

  let {
    open,
    onClose,
    highlights,
    orphans,
    onjump,
    ondelete,
  }: {
    open: boolean;
    onClose: () => void;
    highlights: Highlight[];
    orphans: string[];
    onjump: (id: string) => void;
    ondelete: (id: string) => void;
  } = $props();

  function onOpenChange(next: boolean) {
    if (!next) onClose();
  }
</script>

<Sheet.Root {open} {onOpenChange}>
  <!-- Wider than the shell's default sheet: the excerpts need the room. -->
  <!-- No scrim: the article steps aside rather than being dimmed, so it stays
       readable while the panel is open. -->
  <Sheet.Content
    side="right"
    overlayClass="bg-transparent"
    class="gap-0 sm:max-w-none md:w-[22.5rem]"
  >
    <Sheet.Header class="pb-2">
      <Sheet.Title class="flex items-baseline gap-2 text-lg font-medium">
        Highlights
        <span
          data-testid="highlights-count"
          class="text-muted-foreground text-sm font-normal tabular-nums"
          >{highlights.length}</span
        >
      </Sheet.Title>
    </Sheet.Header>
    <div class="overflow-y-auto px-4 pb-6">
      <HighlightList {highlights} {orphans} {onjump} {ondelete} />
    </div>
  </Sheet.Content>
</Sheet.Root>
