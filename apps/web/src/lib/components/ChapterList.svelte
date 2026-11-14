<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import { flattenToc } from "$lib/reader/toc.js";

  let {
    items,
    activeId,
    onjump,
  }: {
    items: TocEntry[];
    activeId: string | null;
    onjump: (id: string) => void;
  } = $props();

  // One flat row per chapter, indented by depth — the approved render has no
  // collapsing: a toc deep enough to need it is better scrolled than folded.
  const rows = $derived(flattenToc(items));
</script>

<ul class="toc">
  {#each rows as row (row.id)}
    <li>
      <button
        data-depth={row.depth}
        data-current={row.id === activeId}
        aria-current={row.id === activeId ? "location" : undefined}
        onclick={() => onjump(row.id)}><span>{row.text}</span></button
      >
    </li>
  {/each}
</ul>

<style>
  .toc {
    list-style: none;
    margin: 0;
    padding: 0;
    font-family: var(--font-ui);
    font-size: var(--text-md);
    line-height: 1.3;
  }
  li {
    margin: 0;
  }
  button {
    display: flex;
    align-items: center;
    width: 100%;
    /* Thumb-sized rows: the sheet is the phone's only route to the chapters. */
    min-height: 44px;
    padding: 6px var(--space-3);
    border: 0;
    background: none;
    color: var(--color-text-muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      color var(--dur-fast) var(--ease-out),
      background-color var(--dur-fast) var(--ease-out),
      transform var(--dur-base) var(--ease-out);
  }
  button:hover {
    color: var(--color-text);
    background: var(--color-accent-wash);
    transform: translateX(2px);
  }
  button:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: calc(-1 * var(--focus-ring-width));
  }
  /* Sub-chapters sit in from a hairline that stands for their parent. */
  button[data-depth="1"],
  button[data-depth="2"],
  button[data-depth="3"] {
    position: relative;
    padding-left: calc(var(--space-3) + 14px);
    font-size: 0.9375rem;
  }
  button[data-depth="1"]::before,
  button[data-depth="2"]::before,
  button[data-depth="3"]::before {
    content: "";
    position: absolute;
    left: calc(var(--space-3) + 3px);
    top: 4px;
    bottom: 4px;
    width: 1px;
    background: var(--color-hairline);
  }
  button[data-depth="2"] {
    padding-left: calc(var(--space-3) + 28px);
  }
  button[data-depth="2"]::before {
    left: calc(var(--space-3) + 17px);
  }
  button[data-depth="3"] {
    padding-left: calc(var(--space-3) + 42px);
  }
  button[data-depth="3"]::before {
    left: calc(var(--space-3) + 31px);
  }
  /* The chapter being read wears the marker. */
  span {
    background-image: linear-gradient(
      var(--color-marker-soft),
      var(--color-marker-soft)
    );
    background-repeat: no-repeat;
    background-position: 0 88%;
    background-size: 0% 42%;
    padding-inline: 0.08em;
    margin-inline: -0.08em;
    transition: background-size var(--dur-marker) var(--ease-out);
  }
  button[data-current="true"] {
    color: var(--color-text);
    font-weight: var(--weight-medium);
  }
  button[data-current="true"] span {
    background-size: 100% 42%;
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    span {
      transition: none;
    }
  }
</style>
