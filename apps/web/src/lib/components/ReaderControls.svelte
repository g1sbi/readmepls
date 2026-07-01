<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";
  import { AArrowDown, AArrowUp, Type } from "@lucide/svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();
  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}><AArrowDown class="icon-sm" aria-hidden="true" /><span class="sr-only">decrease text size</span></Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}><AArrowUp class="icon-sm" aria-hidden="true" /><span class="sr-only">increase text size</span></Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </Button>
</div>

<style>
  .controls {
    display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;
  }
</style>
