<script lang="ts">
  import type { Highlight } from "@readmepls/types";
  let { highlights, orphans, onjump, ondelete }: {
    highlights: Highlight[];
    orphans: string[];
    onjump: (id: string) => void;
    ondelete: (id: string) => void;
  } = $props();
</script>

<aside class="hl-sidebar" aria-label="highlights">
  <h2>highlights</h2>
  {#if highlights.length === 0}
    <p class="empty">select text to highlight it</p>
  {/if}
  <ul>
    {#each highlights as h (h.id)}
      <li class:orphan={orphans.includes(h.id)}>
        <button class="quote" style="border-color: var(--hl-{h.color});" onclick={() => onjump(h.id)}>
          {h.text}
        </button>
        {#if h.note}<p class="note">{h.note}</p>{/if}
        {#if orphans.includes(h.id)}<p class="warn">can't locate in current text</p>{/if}
        <button class="del" aria-label="delete" onclick={() => ondelete(h.id)}>delete</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .hl-sidebar { display: flex; flex-direction: column; gap: var(--space-3); }
  h2 { font-family: var(--font-display); font-size: var(--text-sm); color: var(--color-text-muted); }
  .empty { color: var(--color-text-muted); font-size: var(--text-sm); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .quote {
    text-align: left; background: none; border: none; border-left: 3px solid var(--color-border);
    padding-left: var(--space-2); cursor: pointer; color: var(--color-text); font: inherit;
  }
  .quote:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .note { color: var(--color-text-muted); font-size: var(--text-sm); margin: var(--space-1) 0 0 var(--space-2); }
  .warn { color: var(--color-accent); font-size: var(--text-xs); margin-left: var(--space-2); }
  .del { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: var(--text-xs); }
  .del:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .orphan .quote { opacity: 0.6; }
</style>
