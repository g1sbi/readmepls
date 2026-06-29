<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";
  import { AArrowDown, AArrowUp, Type, Sun, Moon, Coffee } from "@lucide/svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();

  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}><AArrowDown class="icon-md" aria-hidden="true" /><span class="sr-only">decrease text size</span></Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}><AArrowUp class="icon-md" aria-hidden="true" /><span class="sr-only">increase text size</span></Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </Button>
  <span class="sep" aria-hidden="true"></span>
  <Button onclick={() => emit({ theme: "light" })}><Sun class="icon-sm" aria-hidden="true" /> light</Button>
  <Button onclick={() => emit({ theme: "dark" })}><Moon class="icon-sm" aria-hidden="true" /> dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}><Coffee class="icon-sm" aria-hidden="true" /> sepia</Button>
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
