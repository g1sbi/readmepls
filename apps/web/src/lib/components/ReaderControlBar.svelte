<script lang="ts">
  import { Type, List, Highlighter, MoreHorizontal, type LucideIcon } from "@lucide/svelte";
  import type { SheetKey } from "$lib/reader/control-bar.js";

  let { hasChapters, hidden = false, active = null, onOpen }: {
    hasChapters: boolean;
    hidden?: boolean;
    active?: SheetKey | null;
    onOpen: (sheet: SheetKey) => void;
  } = $props();

  const items: { key: SheetKey; label: string; icon: LucideIcon }[] = [
    { key: "type", label: "text", icon: Type },
    { key: "chapters", label: "chapters", icon: List },
    { key: "highlights", label: "highlights", icon: Highlighter },
    { key: "more", label: "more", icon: MoreHorizontal },
  ];
  const shown = $derived(items.filter((it) => it.key !== "chapters" || hasChapters));
</script>

<nav class="control-bar" aria-label="reader controls" data-hidden={hidden}>
  {#each shown as it (it.key)}
    {@const Icon = it.icon}
    <button
      class="bar-btn"
      class:active={active === it.key}
      aria-current={active === it.key ? "true" : undefined}
      onclick={() => onOpen(it.key)}
    >
      <Icon class="icon-sm" aria-hidden="true" />
      <span>{it.label}</span>
    </button>
  {/each}
</nav>

<style>
  .control-bar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    display: flex; justify-content: space-around; align-items: stretch;
    background: var(--color-surface); border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    transition: transform var(--dur-base) var(--ease-paper);
  }
  .control-bar[data-hidden="true"] { transform: translateY(100%); }
  .bar-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 56px; padding: 0.4rem 0;
    font-family: var(--font-ui); font-size: 0.7rem;
    color: var(--color-text-muted); background: none; border: none; cursor: pointer;
  }
  .bar-btn.active { color: var(--color-accent); }
  .bar-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) { .control-bar { transition: none; } }
</style>
