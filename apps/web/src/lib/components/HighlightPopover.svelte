<script lang="ts">
  import type { HighlightColor } from "@readmepls/types";
  let { x, y, onpick, oncancel }: {
    x: number; y: number;
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();

  const colors: HighlightColor[] = ["terracotta", "amber", "sage"];
  let note = $state("");
</script>

<div class="popover" style="left:{x}px; top:{y}px;" role="dialog" aria-label="add highlight">
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
</div>

<style>
  .popover {
    position: absolute;
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
  .swatches { display: flex; gap: var(--space-1); }
  .swatch {
    width: 1.25rem; height: 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .note {
    border: none;
    border-bottom: 1px solid var(--color-border);
    background: transparent;
    font: inherit;
    color: var(--color-text);
  }
  .cancel { background: none; border: none; cursor: pointer; color: var(--color-text-muted); }
</style>
