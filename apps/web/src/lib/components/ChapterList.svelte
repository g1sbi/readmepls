<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterGroup from "./ChapterGroup.svelte";
  let {
    items,
    activeId,
    onjump,
  }: {
    items: TocEntry[];
    activeId: string | null;
    onjump: (id: string) => void;
  } = $props();
</script>

<ul>
  {#each items as node (node.id)}
    <li>
      {#if node.children.length > 0}
        <ChapterGroup {node} {activeId} {onjump} />
      {:else}
        <button
          class="link"
          class:active={node.id === activeId}
          aria-current={node.id === activeId ? "true" : undefined}
          onclick={() => onjump(node.id)}>{node.text}</button
        >
      {/if}
    </li>
  {/each}
</ul>

<style>
  .link {
    display: block;
    width: 100%;
    text-align: left;
    min-height: 44px;
    padding: var(--space-2);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    color: var(--color-text-muted);
    font: inherit;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .link:hover {
    color: var(--color-text);
  }
  .link.active {
    color: var(--color-accent);
    border-left-color: var(--color-accent);
  }
  .link:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
  }
</style>
