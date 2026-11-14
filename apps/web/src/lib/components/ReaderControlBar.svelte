<script lang="ts">
  import {
    List,
    Highlighter,
    MoreHorizontal,
    type LucideIcon,
  } from "@lucide/svelte";
  import type { SheetKey } from "$lib/reader/control-bar.js";

  let {
    hasChapters,
    hidden = false,
    active = null,
    onOpen,
  }: {
    hasChapters: boolean;
    hidden?: boolean;
    active?: SheetKey | null;
    onOpen: (sheet: SheetKey) => void;
  } = $props();

  const items: { key: SheetKey; label: string; icon: LucideIcon }[] = [
    { key: "chapters", label: "Chapters", icon: List },
    { key: "highlights", label: "Highlights", icon: Highlighter },
    { key: "more", label: "More", icon: MoreHorizontal },
  ];
  const shown = $derived(
    items.filter((it) => it.key !== "chapters" || hasChapters),
  );
</script>

<nav class="control-bar" aria-label="reader controls" data-hidden={hidden}>
  {#each shown as it (it.key)}
    {@const Icon = it.icon}
    <button
      class="bar-btn"
      data-open={active === it.key}
      aria-current={active === it.key ? "true" : undefined}
      aria-expanded={active === it.key}
      onclick={() => onOpen(it.key)}
    >
      <Icon class="icon-sm" aria-hidden="true" />
      <span>{it.label}</span>
    </button>
  {/each}
</nav>

<style>
  /* A floating pill above the home indicator, not a full-width tab bar. */
  .control-bar {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    bottom: calc(env(safe-area-inset-bottom) + var(--space-4));
    z-index: 30;
    height: 62px;
    padding: 4px;
    border-radius: 24px;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    background: color-mix(
      in srgb,
      var(--color-surface-raised) 92%,
      transparent
    );
    backdrop-filter: saturate(1.4) blur(16px);
    box-shadow:
      0 0 0 1px var(--color-hairline),
      var(--shadow-lg);
    transition:
      transform var(--dur-base) var(--ease-out),
      opacity var(--dur-base) var(--ease-out);
  }
  .control-bar[data-hidden="true"] {
    transform: translateY(calc(100% + var(--space-6)));
    opacity: 0;
    transition-timing-function: var(--ease-in);
  }
  .bar-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 44px;
    border: 0;
    border-radius: 20px;
    background: none;
    font: inherit;
    font-family: var(--font-ui);
    font-size: 0.71875rem;
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      transform var(--dur-base) var(--ease-bounce),
      color var(--dur-fast) var(--ease-out);
  }
  .bar-btn:active {
    transform: scale(0.92);
  }
  /* The open slot carries the marker underline. */
  .bar-btn span {
    padding-inline: 2px;
    background-image: linear-gradient(
      var(--color-marker-soft),
      var(--color-marker-soft)
    );
    background-repeat: no-repeat;
    background-position: 0 88%;
    background-size: 0% 42%;
    transition: background-size var(--dur-marker) var(--ease-out);
  }
  .bar-btn[data-open="true"] {
    color: var(--color-text);
  }
  .bar-btn[data-open="true"] span {
    background-size: 100% 42%;
  }
  .bar-btn:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
  }
  @media (prefers-reduced-motion: reduce) {
    .control-bar,
    .bar-btn,
    .bar-btn span {
      transition: none;
    }
  }
</style>
