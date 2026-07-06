<script lang="ts">
  import type { Snippet } from "svelte";
  let { open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children?: Snippet;
  } = $props();

  let panel = $state<HTMLElement | null>(null);
  $effect(() => { if (open) panel?.focus(); });
</script>

{#if open}
  <div class="backdrop" data-testid="sheet-backdrop" onclick={onClose} aria-hidden="true"></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    bind:this={panel}
    onkeydown={(e) => { if (e.key === "Escape") onClose(); }}
  >
    <header class="sheet-head">
      <h2>{title}</h2>
      <button class="close" aria-label={`close ${title}`} onclick={onClose}>✕</button>
    </header>
    <div class="sheet-body">{#if children}{@render children()}{/if}</div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(22rem, 90vw);
    background: var(--color-surface); box-shadow: var(--shadow-lg); z-index: 50;
    display: flex; flex-direction: column; padding: var(--space-4); overflow-y: auto;
  }
  .sheet:focus-visible { outline: none; }
  .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .sheet-head h2 { font-family: var(--font-ui); font-size: var(--text-lg); color: var(--color-text); margin: 0; }
  .close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: var(--text-lg); }
  .close:hover { color: var(--color-accent); }
</style>
