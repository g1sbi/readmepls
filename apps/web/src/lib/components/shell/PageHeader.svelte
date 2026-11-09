<script lang="ts">
  import type { Snippet } from "svelte";
  import { Search, Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import CaptureSheet from "./CaptureSheet.svelte";

  let { title, actions }: { title: string; actions?: Snippet } = $props();
  let captureOpen = $state(false);
</script>

<header class="flex items-center gap-2 pb-4 md:pb-6">
  <h1
    class="min-w-0 flex-1 truncate text-2xl font-medium tracking-tight md:text-3xl"
  >
    {title}
  </h1>
  <div class="flex shrink-0 items-center gap-2">
    {#if actions}{@render actions()}{/if}
    <Button
      variant="outline"
      size="icon"
      class="shrink-0"
      aria-label="Search"
      onclick={() => searchPalette.open()}
    >
      <Search aria-hidden="true" />
    </Button>
    <Button
      variant="default"
      size="icon"
      class="shrink-0"
      aria-label="Save a link"
      onclick={() => (captureOpen = true)}
    >
      <Plus aria-hidden="true" />
    </Button>
  </div>
</header>

<CaptureSheet open={captureOpen} onClose={() => (captureOpen = false)} />
