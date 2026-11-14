<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import type { HighlightColor } from "@readmepls/types";
  import HighlightPicker from "./HighlightPicker.svelte";

  let {
    x,
    y,
    onpick,
    oncancel,
  }: {
    x: number;
    y: number;
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();

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

<Popover.Root open {onOpenChange}>
  <Popover.Content
    customAnchor={anchor}
    class="hl-popover"
    role="dialog"
    aria-label="Add highlight"
    side="top"
    sideOffset={8}
  >
    <HighlightPicker label="Pick a color" {onpick} />
  </Popover.Content>
</Popover.Root>

<style>
  /* Anchor is invisible; only its position matters. Floating UI flips the
     popover below the selection when there is no room above. */
  .anchor {
    position: absolute;
    width: 0;
    height: 0;
  }
  /* Popover content portals to the body, so the shell is :global. */
  :global(.hl-popover) {
    width: 292px;
    border-radius: 18px;
    padding: var(--space-2);
    box-shadow:
      0 0 0 1px var(--color-hairline),
      var(--shadow-xl);
    animation: hl-pop-in var(--dur-base) var(--ease-bounce) both;
  }
  @keyframes hl-pop-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.hl-popover) {
      animation: none;
    }
  }
</style>
