<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();

  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}>A−</Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}>A+</Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    {prefs.font === "serif" ? "Sans" : "Serif"}
  </Button>
  <Button onclick={() => emit({ theme: "light" })}>Light</Button>
  <Button onclick={() => emit({ theme: "dark" })}>Dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}>Sepia</Button>
</div>
