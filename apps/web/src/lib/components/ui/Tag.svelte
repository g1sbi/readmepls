<script lang="ts">
  import type { Snippet } from "svelte";
  import Chip from "./Chip.svelte";
  let { children }: { children?: Snippet } = $props();
</script>

{#if children}
  <Chip {children} />
{/if}
