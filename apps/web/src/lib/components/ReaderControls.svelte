<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();

  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}>A−</Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}>A+</Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    {prefs.font === "serif" ? "Sans" : "Serif"}
  </Button>
  <span class="sep" aria-hidden="true"></span>
  <Button onclick={() => emit({ theme: "light" })}>Light</Button>
  <Button onclick={() => emit({ theme: "dark" })}>Dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}>Sepia</Button>
</div>

<style>
  .controls {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
    padding: 0.6rem 0.8rem; margin-bottom: 1rem;
    background: var(--color-surface); border-radius: var(--radius-pill);
    box-shadow: var(--shadow-sm);
  }
  .sep { width: 1px; height: 1.4rem; background: var(--color-border); margin: 0 0.3rem; }
</style>
