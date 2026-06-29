<script lang="ts">
  import { Popover } from "bits-ui";
  import type { HighlightColor } from "@readmepls/types";

  let { x, y, onpick, oncancel }: {
    x: number; y: number;
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();

  const colors: HighlightColor[] = ["terracotta", "amber", "sage"];
  let note = $state("");

  // Zero-size element placed at the selection rect; Popover.Content anchors to it
  // and Floating UI handles viewport-edge flip/collision (replaces manual left/top).
  let anchor = $state<HTMLElement>(null!);

  // Open while mounted (the reader gates this component with {#if popover}).
  // A Bits-initiated close (Escape / outside-click) requests open=false — route
  // it to oncancel so the reader clears its `popover` state and unmounts us.
  function onOpenChange(next: boolean) {
    if (!next) oncancel();
  }
</script>

<div bind:this={anchor} class="anchor" style="left:{x}px; top:{y}px;"></div>

<Popover.Root open onOpenChange={onOpenChange}>
  <Popover.Content customAnchor={anchor} class="popover" role="dialog" aria-label="add highlight" sideOffset={4}>
    <div class="swatches">
      {#each colors as c}
        <button
          class="swatch"
          style="background: var(--hl-{c});"
          aria-label={c}
          onclick={() => onpick(c, note)}
        ></button>
      {/each}
    </div>
    <input class="note" placeholder="note…" bind:value={note} aria-label="note" />
    <button class="cancel" onclick={oncancel} aria-label="cancel">×</button>
  </Popover.Content>
</Popover.Root>

<style>
  /* Anchor is invisible; only its position matters. */
  .anchor {
    position: absolute;
    width: 0;
    height: 0;
  }
  /* Bits UI portals Popover.Content to the body, so styles are :global with a
     specific class. Values copied from the previous version — no visual change. */
  :global(.popover) {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: var(--z-sticky);
  }
  :global(.popover) .swatches { display: flex; gap: var(--space-1); }
  :global(.popover) .swatch {
    width: 1.25rem; height: 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.popover) .note {
    border: none;
    border-bottom: 1px solid var(--color-border);
    background: transparent;
    font: inherit;
    color: var(--color-text);
  }
  :global(.popover) .cancel {
    background: none; border: none; cursor: pointer; color: var(--color-text-muted);
  }
</style>
