<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog } from "bits-ui";
  let { open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children?: Snippet;
  } = $props();

  // Bits UI Portal renders Overlay/Content into document.body, escaping the
  // root layout's `.page` column — `.page` has a `transform`-keyframed
  // `animation`, which per spec makes it a containing block for
  // `position: fixed` descendants, breaking a non-portaled fixed sheet's
  // full-viewport backdrop/right-edge placement.
  function onOpenChange(next: boolean) { if (!next) onClose(); }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="sheet-backdrop" data-testid="sheet-backdrop" />
    <Dialog.Content class="sheet">
      <header class="sheet-head">
        <Dialog.Title class="sheet-title">{title}</Dialog.Title>
        <button class="close" aria-label={`close ${title}`} onclick={onClose}>✕</button>
      </header>
      <div class="sheet-body">{#if children}{@render children()}{/if}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.sheet-backdrop) { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  :global(.sheet) {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(22rem, 90vw);
    background: var(--color-surface); box-shadow: var(--shadow-lg); z-index: 50;
    display: flex; flex-direction: column; padding: var(--space-4); overflow-y: auto;
  }
  :global(.sheet):focus-visible { outline: none; }
  .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  :global(.sheet-title) { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text); margin: 0; }
  .close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: var(--text-lg); }
  .close:hover { color: var(--color-accent); }
</style>
