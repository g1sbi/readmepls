<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import { flattenToc } from "$lib/reader/toc.js";

  let {
    toc,
    activeId,
    hidden = false,
    onjump,
  }: {
    toc: TocEntry[];
    activeId: string | null;
    /** The highlights panel has the stage: fade out and stop taking taps. */
    hidden?: boolean;
    onjump: (id: string) => void;
  } = $props();

  const rows = $derived(flattenToc(toc));

  // How close the pointer has to come to the left edge for the column to
  // reach full opacity (the ticks rest at 40%).
  const NEAR_PX = 170;
  const OPEN_DELAY = 100; // hover intent: a passing pointer must not expand it
  const CLOSE_DELAY = 200;
  const JUMP_COLLAPSE = 350; // let the row's press register before it folds

  let near = $state(false);
  let expanded = $state(false);
  let dismissed = $state(false); // Escape wins until focus leaves
  let column = $state<HTMLElement>(null!);
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  // Touch and pen get the tap-to-expand path; a mouse expands on hover.
  let coarse = false;

  function setExpanded(next: boolean) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    expanded = next;
  }

  function onPointerEnter() {
    near = true;
    dismissed = false;
    if (coarse) return;
    clearTimeout(closeTimer);
    openTimer = setTimeout(() => (expanded = true), OPEN_DELAY);
  }

  function onPointerLeave() {
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => {
      if (!column?.contains(document.activeElement)) expanded = false;
    }, CLOSE_DELAY);
  }

  function onKeyDown(e: KeyboardEvent) {
    const items = [
      ...(column?.querySelectorAll<HTMLButtonElement>(".tick") ?? []),
    ];
    // The key came from the row that has focus; read it off the event rather
    // than document.activeElement, which a programmatic key never moves.
    const i = items.indexOf(
      (e.target as HTMLElement).closest(".tick") as HTMLButtonElement,
    );
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(
        items.length - 1,
        Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)),
      );
      items[next]?.focus();
      items[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Enter" && i >= 0) {
      // jsdom aside, a native button would also fire click here; claiming the
      // key keeps the jump from running twice.
      e.preventDefault();
      jump(rows[i]!.id);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      dismissed = true;
      setExpanded(false);
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }

  function jump(id: string) {
    onjump(id);
    closeTimer = setTimeout(() => (expanded = false), JUMP_COLLAPSE);
  }

  function onRowClick(id: string) {
    // On touch the first tap only opens the list; the next one jumps.
    if (coarse && !expanded) {
      setExpanded(true);
      return;
    }
    jump(id);
  }

  // Proximity (opacity) and the outside-tap collapse both need the window.
  $effect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") near = e.clientX <= NEAR_PX;
    };
    const onDown = (e: PointerEvent) => {
      coarse = e.pointerType !== "mouse";
      if (coarse && !column?.contains(e.target as Node)) setExpanded(false);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  });

  const open = $derived(expanded && !dismissed);
</script>

{#if rows.length}
  <div class="ticks" data-near={near || open} data-hidden={hidden}>
    <!-- The column is the hover and focus surface for its own rows. -->
    <nav
      bind:this={column}
      class="tocard"
      aria-label="Chapters"
      data-expanded={open}
      onpointerenter={onPointerEnter}
      onpointerleave={onPointerLeave}
      onfocusin={() => {
        dismissed = false;
        setExpanded(true);
      }}
      onfocusout={(e) => {
        if (!column?.contains(e.relatedTarget as Node | null))
          setExpanded(false);
      }}
      onkeydown={onKeyDown}
    >
      <ul>
        {#each rows as row, i (row.id)}
          <li>
            <button
              class="tick"
              data-sub={row.depth > 0}
              data-current={row.id === activeId}
              style={`--i:${i}`}
              aria-current={row.id === activeId ? "location" : undefined}
              onclick={() => onRowClick(row.id)}
            >
              <span class="mark" aria-hidden="true"></span>
              <span class="label">{row.text}</span>
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
{/if}

<style>
  /* The column sits in the article's left margin, vertically centred below
     the header, and rests at 40% until the pointer comes near or a tick
     takes focus. */
  .ticks {
    position: fixed;
    left: 0;
    top: var(--topbar-h, 3.5rem);
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--space-4) 0;
    opacity: 0.4;
    transition: opacity var(--dur-base) var(--ease-out);
    pointer-events: none;
  }
  .ticks[data-near="true"] {
    opacity: 1;
  }
  .ticks[data-hidden="true"] {
    opacity: 0;
    pointer-events: none;
  }
  /* No hover to reveal them with, so they stay legible. */
  @media (pointer: coarse) {
    .ticks {
      opacity: 1;
    }
  }
  .tocard {
    pointer-events: auto;
    position: relative;
    margin-left: var(--space-2);
    width: 56px;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-width: none;
    padding: 6px;
    border-radius: var(--radius-md);
    background: transparent;
    box-shadow: none;
    /* collapse is quicker than expand, and eases in */
    transition:
      width var(--dur-fast) var(--ease-in),
      background-color var(--dur-fast) var(--ease-in),
      box-shadow var(--dur-fast) var(--ease-in);
  }
  .tocard::-webkit-scrollbar {
    display: none;
  }
  .tocard[data-expanded="true"] {
    /* capped to the left margin: 272px, ending clear of the article */
    width: min(272px, calc(50vw - 23rem));
    background: var(--color-surface-raised);
    box-shadow:
      0 0 0 1px var(--color-hairline),
      var(--shadow-lg);
    transition:
      width var(--dur-base) var(--ease-out),
      background-color var(--dur-base) var(--ease-out),
      box-shadow var(--dur-base) var(--ease-out);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tick {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    /* 44px rows, so a tick is tappable even while it reads as a hairline */
    height: 44px;
    border: 0;
    background: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    font: inherit;
    font-family: var(--font-ui);
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  .mark {
    position: absolute;
    left: 10px;
    top: 50%;
    height: 1.5px;
    width: 18px;
    margin-top: -0.75px;
    background: var(--color-text-subtle);
    border-radius: 1px;
    transition:
      width var(--dur-fast) var(--ease-in),
      left var(--dur-fast) var(--ease-in),
      background-color var(--dur-fast) var(--ease-out);
  }
  .tick[data-sub="true"] .mark {
    width: 10px;
    opacity: 0.6;
  }
  .tick[data-current="true"] .mark {
    width: 26px;
    height: 2px;
    background: var(--color-text);
    opacity: 1;
  }
  .tocard:not([data-expanded="true"]) .tick:hover .mark {
    width: 30px;
    background: var(--color-text);
    opacity: 1;
  }
  .label {
    position: absolute;
    left: 30px;
    right: 8px;
    top: 50%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-sm);
    line-height: 1.2;
    letter-spacing: -0.005em;
    opacity: 0;
    transform: translate(-8px, -50%);
    transition:
      opacity var(--dur-fast) var(--ease-in),
      transform var(--dur-fast) var(--ease-in);
  }
  .tick[data-sub="true"] .label {
    left: 44px;
    font-size: 0.8125rem;
  }
  .tick[data-current="true"] .label {
    color: var(--color-text);
    font-weight: var(--weight-medium);
    background-image: linear-gradient(
      var(--color-marker-soft),
      var(--color-marker-soft)
    );
    background-repeat: no-repeat;
    background-position: 0 88%;
    background-size: 100% 42%;
  }
  /* Expanded: the ticks shrink to leading dashes and the labels slide in,
     staggered 16ms per row and capped at 160ms. */
  .tocard[data-expanded="true"] .mark {
    width: 10px;
    left: 12px;
    transition:
      width var(--dur-base) var(--ease-out),
      left var(--dur-base) var(--ease-out);
  }
  .tocard[data-expanded="true"] .tick[data-sub="true"] .mark {
    width: 6px;
    left: 26px;
  }
  .tocard[data-expanded="true"] .tick[data-current="true"] .mark {
    width: 12px;
  }
  .tocard[data-expanded="true"] .label {
    opacity: 1;
    transform: translate(0, -50%);
    transition:
      opacity var(--dur-base) var(--ease-out),
      transform var(--dur-base) var(--ease-out);
    transition-delay: min(calc(var(--i) * 16ms), 160ms);
  }
  .tocard[data-expanded="true"] .tick:hover,
  .tocard[data-expanded="true"] .tick:focus-visible {
    background: var(--color-accent-wash);
    color: var(--color-text);
  }
  .tick:focus-visible {
    outline: none;
  }
  .tocard[data-expanded="true"] .tick:focus-visible {
    box-shadow: inset 0 0 0 var(--focus-ring-width) var(--color-ring);
  }
  .tocard:not([data-expanded="true"]) .tick:focus-visible .mark {
    box-shadow:
      0 0 0 2px var(--reading-bg),
      0 0 0 4px var(--color-ring);
  }
  @media (prefers-reduced-motion: reduce) {
    .ticks,
    .tocard,
    .mark,
    .label {
      transition: none;
    }
  }
</style>
