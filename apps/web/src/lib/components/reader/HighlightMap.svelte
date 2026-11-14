<script lang="ts">
  import type { Highlight } from "@readmepls/types";
  import type { MapPosition } from "$lib/reader/highlight-map.js";
  import { StickyNote } from "@lucide/svelte";

  let {
    highlights,
    positions,
    viewport,
    onjump,
  }: {
    highlights: Highlight[];
    positions: MapPosition[];
    /** The part of the article on screen, both as shares of its height. */
    viewport: { at: number; size: number };
    onjump: (id: string) => void;
  } = $props();

  // Stored keys are legacy; the Marker names are what the reader shows.
  const COLOR_NAME = {
    terracotta: "Yellow",
    amber: "Rose",
    sage: "Mint",
  } as const;

  /** How close the pointer has to come for the track to reach full opacity. */
  const NEAR_PX = 120;

  // Only placed highlights are drawn: an orphan has no mark to measure, so it
  // lives in the panel and the sheet alone.
  const drawn = $derived(
    positions
      .map((p) => ({ pos: p, hl: highlights.find((h) => h.id === p.id) }))
      .filter((d): d is { pos: MapPosition; hl: Highlight } => !!d.hl),
  );

  let near = $state(false);
  let activeId = $state<string | null>(null);
  const active = $derived(drawn.find((d) => d.hl.id === activeId) ?? null);

  let map = $state<HTMLElement>(null!);
  let coarse = false;

  function show(id: string) {
    activeId = id;
  }

  function onRowClick(id: string) {
    // On touch the first tap only shows the card; a second tap jumps.
    if (coarse && activeId !== id) {
      show(id);
      return;
    }
    onjump(id);
  }

  function onKeyDown(e: KeyboardEvent, id: string) {
    if (e.key !== "Enter") return;
    // Claim the key so a native button activation can't jump twice.
    e.preventDefault();
    onjump(id);
  }

  $effect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      near = e.clientX >= window.innerWidth - NEAR_PX;
    };
    const onDown = (e: PointerEvent) => {
      coarse = e.pointerType !== "mouse";
      if (coarse && !map?.contains(e.target as Node)) activeId = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
    };
  });
</script>

{#if drawn.length}
  <div class="map" bind:this={map} data-near={near}>
    <span class="track" aria-hidden="true"></span>
    <span
      class="viewport"
      style={`top:${viewport.at * 100}%;height:${viewport.size * 100}%`}
      aria-hidden="true"
    ></span>
    {#each drawn as d (d.hl.id)}
      <button
        class="mtick"
        style={`top:${d.pos.at * 100}%`}
        data-color={d.hl.color}
        data-has-note={d.hl.note ? "true" : "false"}
        aria-label={`Highlight: ${d.hl.text}`}
        onfocus={() => show(d.hl.id)}
        onblur={() => (activeId = null)}
        onpointerenter={() => {
          if (!coarse) show(d.hl.id);
        }}
        onpointerleave={() => {
          if (!coarse) activeId = null;
        }}
        onclick={() => onRowClick(d.hl.id)}
        onkeydown={(e) => onKeyDown(e, d.hl.id)}
      >
        <span class="mark" aria-hidden="true"></span>
        {#if d.hl.note}<span class="dot" aria-hidden="true"></span>{/if}
      </button>
    {/each}
    {#if active}
      <div
        class="hlcard"
        role="dialog"
        aria-label="Highlight"
        data-color={active.hl.color}
        style={`top:${active.pos.at * 100}%`}
      >
        <q>{active.hl.text}</q>
        {#if active.hl.note}
          <p class="note">
            <StickyNote class="icon-sm" aria-hidden="true" />
            <span>{active.hl.note}</span>
          </p>
        {/if}
        <p class="hint">
          <span class="swatch" aria-hidden="true"></span>
          {COLOR_NAME[active.hl.color]}
          <span class="jump">Click to jump</span>
        </p>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The track stands for the whole article down the right edge, resting at
     40% until the pointer comes near or a tick takes focus. */
  .map {
    position: fixed;
    right: 0;
    top: calc(var(--topbar-h, 3.5rem) + var(--space-5));
    bottom: var(--space-6);
    width: 64px;
    z-index: 20;
    opacity: 0.4;
    transition: opacity var(--dur-base) var(--ease-out);
  }
  .map[data-near="true"],
  .map:focus-within {
    opacity: 1;
  }
  /* No hover to reveal it with. */
  @media (pointer: coarse) {
    .map {
      opacity: 1;
    }
  }
  .track {
    position: absolute;
    right: 23px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--color-hairline);
  }
  .viewport {
    position: absolute;
    right: 22px;
    width: 3px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-text) 30%, transparent);
    transition: top 80ms linear;
  }
  .mtick {
    position: absolute;
    right: 8px;
    /* 48x44 hit area around a 16x3 tick */
    width: 48px;
    height: 44px;
    margin-top: -22px;
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .mark {
    position: absolute;
    right: 15px;
    top: 50%;
    width: 16px;
    height: 3px;
    margin-top: -1.5px;
    border-radius: 2px;
    background: var(--sw);
    transform-origin: 100% 50%;
    transition: width var(--dur-base) var(--ease-out);
  }
  .mtick[data-color="terracotta"],
  .hlcard[data-color="terracotta"] {
    --sw: var(--hl-terracotta-solid);
  }
  .mtick[data-color="amber"],
  .hlcard[data-color="amber"] {
    --sw: var(--hl-amber-solid);
  }
  .mtick[data-color="sage"],
  .hlcard[data-color="sage"] {
    --sw: var(--hl-sage-solid);
  }
  .dot {
    position: absolute;
    right: 36px;
    top: 50%;
    width: 5px;
    height: 5px;
    margin-top: -2.5px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
  .mtick:hover .mark,
  .mtick:focus-visible .mark {
    width: 24px;
  }
  .mtick:focus-visible {
    outline: none;
  }
  .mtick:focus-visible .mark {
    box-shadow:
      0 0 0 2px var(--reading-bg),
      0 0 0 4px var(--color-ring);
  }
  /* The card opens toward the article, not off the edge. */
  .hlcard {
    position: absolute;
    right: 54px;
    width: 256px;
    margin-top: -1.5rem;
    background: var(--color-surface-raised);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    box-shadow:
      0 0 0 1px var(--color-hairline),
      var(--shadow-lg);
  }
  q {
    quotes: none;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: var(--font-reading);
    font-size: var(--text-sm);
    line-height: 1.5;
    background-image: linear-gradient(transparent 30%, var(--sw) 30%);
    background-repeat: no-repeat;
  }
  .note {
    display: flex;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    font-family: var(--font-ui);
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--color-text-muted);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 10px 0 0;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
  }
  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 1px var(--color-hairline);
  }
  .jump {
    margin-left: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .map,
    .mark,
    .viewport {
      transition: none;
    }
  }
</style>
