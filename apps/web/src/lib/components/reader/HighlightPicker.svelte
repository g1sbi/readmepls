<script lang="ts">
  import type { HighlightColor } from "@readmepls/types";
  import { StickyNote, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";

  let {
    label,
    size = "popover",
    onpick,
    onclose,
  }: {
    label: string;
    /** The tray gives every control more room than the desktop popover. */
    size?: "popover" | "tray";
    onpick: (color: HighlightColor, note: string) => void;
    onclose?: () => void;
  } = $props();

  const colors: HighlightColor[] = ["terracotta", "amber", "sage"];
  // Stored keys are legacy; the swatches render the Marker colors, so the
  // accessible name follows what is displayed.
  const labels: Record<HighlightColor, string> = {
    terracotta: "Yellow",
    amber: "Rose",
    sage: "Mint",
  };
  let note = $state("");
</script>

<div class="picker" data-size={size}>
  <div class="row">
    {#each colors as c (c)}
      <button
        class="sw"
        data-color={c}
        data-primary={c === "terracotta" ? "true" : undefined}
        aria-label={labels[c]}
        title={labels[c]}
        onclick={() => onpick(c, note)}
      ></button>
    {/each}
    <span class="lab">{label}</span>
    {#if onclose}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onclick={onclose}
      >
        <X aria-hidden="true" />
      </Button>
    {/if}
  </div>
  <label class="notefield">
    <StickyNote class="icon-sm" aria-hidden="true" />
    <input
      aria-label="Add a note (optional)"
      placeholder="Add a note, then pick a color"
      bind:value={note}
    />
  </label>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .lab {
    margin: 0 0 0 auto;
    padding-right: 2px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-subtle);
  }
  .sw {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    position: relative;
    transition: transform var(--dur-base) var(--ease-bounce);
  }
  /* The tray is thumb-driven: 48px targets and a larger dot. */
  [data-size="tray"] .sw {
    width: 48px;
    height: 48px;
  }
  .sw::before {
    content: "";
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 1px var(--color-hairline);
  }
  [data-size="tray"] .sw::before {
    width: 28px;
    height: 28px;
  }
  .sw:hover {
    transform: scale(1.12);
  }
  .sw:active {
    transform: scale(0.9);
  }
  .sw[data-primary="true"]::after {
    content: "";
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--color-text);
  }
  .sw:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .sw[data-color="terracotta"] {
    --sw: var(--hl-terracotta-solid);
  }
  .sw[data-color="amber"] {
    --sw: var(--hl-amber-solid);
  }
  .sw[data-color="sage"] {
    --sw: var(--hl-sage-solid);
  }
  .notefield {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    margin-top: 6px;
    padding: 0 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-text) 5%, transparent);
    color: var(--color-text-subtle);
  }
  [data-size="tray"] .notefield {
    height: 44px;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text);
  }
  [data-size="tray"] input {
    font-size: var(--text-md);
  }
  input:focus {
    outline: none;
  }
  input::placeholder {
    color: var(--color-text-subtle);
  }
  @media (prefers-reduced-motion: reduce) {
    .sw {
      transition: none;
    }
  }
</style>
