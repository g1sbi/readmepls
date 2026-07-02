<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import { AArrowDown, AArrowUp, Type } from "@lucide/svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();
  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <button class="seg" onclick={() => emit({ size: clampSize(prefs.size - 1) })} aria-label="decrease text size">
    <AArrowDown class="icon-sm" aria-hidden="true" />
  </button>
  <button class="seg" onclick={() => emit({ size: clampSize(prefs.size + 1) })} aria-label="increase text size">
    <AArrowUp class="icon-sm" aria-hidden="true" />
  </button>
  <button class="seg seg--text" onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </button>
</div>

<style>
  .controls {
    display: inline-flex; align-items: stretch;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .seg {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1);
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-muted);
    background: none; border: none; cursor: pointer;
    padding: var(--space-2) var(--space-3);
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .seg + .seg { border-left: 1px solid var(--color-border); }
  .seg:hover { background: var(--color-accent-wash); color: var(--color-text); }
  .seg:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: -2px; }
  .seg--text { min-width: 4.5rem; }
  @media (prefers-reduced-motion: reduce) { .seg { transition: none; } }
</style>
