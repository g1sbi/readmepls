<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterList from "./ChapterList.svelte";
  let {
    toc,
    activeId = null,
    onjump,
  }: {
    toc: TocEntry[];
    activeId?: string | null;
    onjump: (id: string) => void;
  } = $props();
</script>

<nav class="toc" aria-label="chapters">
  <ChapterList items={toc} {activeId} {onjump} />
</nav>

<style>
  .toc {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }
  .toc :global(ul) {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .toc :global(ul ul) {
    margin-left: var(--space-3);
  }
</style>
