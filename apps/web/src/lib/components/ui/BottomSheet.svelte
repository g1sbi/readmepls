<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Drawer from "$lib/components/ui/drawer";
  let { open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children?: Snippet;
  } = $props();

  // Unlike bits-ui's Dialog (used by Sheet.svelte), the generated
  // Drawer.Content already composes its own Portal + Overlay + drag handle
  // internally (vaul-svelte), so wrapping it in another Portal/Overlay here
  // would double them up. Content is the single top-level unit to render.
  function onOpenChange(next: boolean) { if (!next) onClose(); }
</script>

<Drawer.Root {open} {onOpenChange}>
  <Drawer.Content class="bottomsheet">
    <header class="bottomsheet-head">
      <Drawer.Title class="bottomsheet-title">{title}</Drawer.Title>
      <button class="close" aria-label={`close ${title}`} onclick={onClose}>✕</button>
    </header>
    <div class="bottomsheet-body">{#if children}{@render children()}{/if}</div>
  </Drawer.Content>
</Drawer.Root>

<style>
  :global(.bottomsheet) {
    background: var(--color-surface) !important;
    border-top-left-radius: var(--radius-lg) !important;
    border-top-right-radius: var(--radius-lg) !important;
    box-shadow: var(--shadow-lg);
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    max-height: 85vh !important;
    margin-top: 0 !important;
  }
  :global(.bottomsheet):focus-visible { outline: none; }
  .bottomsheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  :global(.bottomsheet-title) { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text); margin: 0; }
  .bottomsheet-body { overflow-y: auto; }
  .close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: var(--text-lg); }
  .close:hover { color: var(--color-accent); }
</style>
