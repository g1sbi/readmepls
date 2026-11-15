<script lang="ts">
  import { Trash2, StickyNote, TriangleAlert } from "@lucide/svelte";
  import type { Highlight } from "@readmepls/types";
  import { Button } from "$lib/components/ui/button";
  import { markerInView } from "$lib/actions/marker-in-view.js";

  let {
    highlights,
    orphans,
    onjump,
    ondelete,
  }: {
    highlights: Highlight[];
    orphans: string[];
    onjump: (id: string) => void;
    ondelete: (id: string) => void;
  } = $props();
</script>

{#if highlights.length === 0}
  <p class="empty">
    Select any text to <span class="marker-swipe" use:markerInView
      >highlight</span
    > it. Add a note if you like.
  </p>
{/if}
<ul class="hls">
  {#each highlights as h (h.id)}
    <li data-color={h.color} data-orphan={orphans.includes(h.id)}>
      <!-- The excerpt is the jump target; the whole row would swallow the
           delete button's tap. -->
      <q
        role="button"
        tabindex="0"
        onclick={() => onjump(h.id)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onjump(h.id);
          }
        }}><span>{h.text}</span></q
      >
      {#if h.note}
        <p class="note">
          <StickyNote class="icon-sm" aria-hidden="true" />
          <span>{h.note}</span>
        </p>
      {/if}
      {#if orphans.includes(h.id)}
        <p class="warn">
          <TriangleAlert class="icon-sm" aria-hidden="true" />
          Can't find this in the current text
        </p>
      {/if}
      <Button
        variant="ghost"
        size="icon-sm"
        class="del"
        aria-label={`Delete highlight: ${h.text}`}
        onclick={() => ondelete(h.id)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  {/each}
</ul>

<style>
  .empty {
    margin: var(--space-2) var(--space-3);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text-muted);
  }
  .hls {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    position: relative;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    transition:
      background-color var(--dur-fast) var(--ease-out),
      transform var(--dur-base) var(--ease-out),
      box-shadow var(--dur-base) var(--ease-out);
  }
  li + li {
    margin-top: 2px;
  }
  li[data-color="terracotta"] {
    --hlc: var(--hl-terracotta);
  }
  li[data-color="amber"] {
    --hlc: var(--hl-amber);
  }
  li[data-color="sage"] {
    --hlc: var(--hl-sage);
  }
  q {
    quotes: none;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: var(--font-reading);
    font-size: var(--text-md);
    line-height: 1.5;
    color: var(--color-text);
    padding-right: 32px;
    cursor: pointer;
  }
  /* The band rides the text's own lines, so it has to sit on an inline box. */
  q span {
    background-image: linear-gradient(transparent 30%, var(--hlc) 30%);
    background-repeat: no-repeat;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    padding-inline: 1px;
  }
  q:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
    border-radius: var(--radius-sm);
  }
  li[data-orphan="true"] q {
    color: var(--color-text-muted);
  }
  li[data-orphan="true"] q span {
    background-image: none;
  }
  .note {
    display: flex;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding-right: 32px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--color-text-muted);
  }
  .note :global(svg) {
    margin-top: 2px;
    color: var(--color-text-subtle);
  }
  .warn {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: var(--space-2) 0 0;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-warning);
  }
  li :global(.del) {
    position: absolute;
    top: 2px;
    right: 2px;
    color: var(--color-text-subtle);
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  /* Delete stays visible on touch — there's no hover to reveal it with. */
  @media (hover: hover) and (pointer: fine) {
    li:hover {
      background: var(--color-surface);
      box-shadow:
        0 0 0 1px var(--color-hairline),
        var(--shadow-md);
      transform: translateY(-1px);
    }
    li :global(.del) {
      opacity: 0;
    }
    li:hover :global(.del),
    li :global(.del):focus-visible {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    li,
    li :global(.del) {
      transition: none;
    }
  }
</style>
