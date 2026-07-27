<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterList from "./ChapterList.svelte";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ChevronRight } from "@lucide/svelte";

  let {
    node,
    activeId,
    onjump,
  }: {
    node: TocEntry;
    activeId: string | null;
    onjump: (id: string) => void;
  } = $props();

  const containsActive = (n: TocEntry): boolean =>
    n.id === activeId || n.children.some(containsActive);

  // Expanded by default; force-open when the active heading is inside.
  let open = $state(true);
  $effect(() => {
    if (containsActive(node)) open = true;
  });
</script>

<Collapsible.Root bind:open>
  <div class="row">
    <button
      class="link"
      class:active={node.id === activeId}
      aria-current={node.id === activeId ? "true" : undefined}
      onclick={() => onjump(node.id)}
    >{node.text}</button>
    <Collapsible.Trigger class="toggle" aria-label={`toggle ${node.text} subchapters`}>
      <ChevronRight class="icon-sm chevron" data-open={open} aria-hidden="true" />
    </Collapsible.Trigger>
  </div>
  <Collapsible.Content>
    <ChapterList items={node.children} {activeId} {onjump} />
  </Collapsible.Content>
</Collapsible.Root>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .link {
    flex: 1;
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
  /* .toggle lands on Collapsible.Trigger and .chevron on the lucide icon —
     both are child components, so a plain rule never gets this component's
     scoping hash and would silently match nothing. Anchor to the scoped
     `.row` ancestor and mark the child-owned class :global. */
  .row :global(.toggle) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .row :global(.toggle):focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .row :global(.chevron) {
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .row :global(.chevron[data-open="true"]) {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .row :global(.chevron) {
      transition: none;
    }
  }
</style>
