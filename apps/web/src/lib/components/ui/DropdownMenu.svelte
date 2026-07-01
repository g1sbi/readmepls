<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu } from "bits-ui";

  let {
    label,
    trigger,
    children,
    align = "end",
  }: {
    label: string;
    trigger: Snippet;
    children: Snippet;
    align?: "start" | "center" | "end";
  } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="dropdown__trigger" aria-label={label}>
    {@render trigger()}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="dropdown__panel" {align} sideOffset={6}>
      {@render children()}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* bits-ui applies these classes to its portaled parts; tokens only. */
  :global(.dropdown__panel) {
    display: flex; flex-direction: column;
    min-width: 12rem;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: var(--space-1);
    z-index: var(--z-modal, 100);
  }
  :global(.dropdown__panel:focus-visible) { outline: none; }
  :global(.menu-item) {
    display: flex; align-items: center; gap: var(--space-2);
    width: 100%; text-align: left;
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text); background: none; border: none; cursor: pointer;
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  }
  :global(.menu-item:hover),
  :global(.menu-item[data-highlighted]) { background: var(--color-accent-wash); }
  :global(.menu-item[data-variant="danger"]) { color: var(--color-accent); }
  :global(.menu-item:focus-visible) {
    outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: -2px;
  }
  :global(.menu-label) {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-subtle);
    padding: var(--space-2) var(--space-3) var(--space-1);
  }
  :global(.menu-empty) {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-subtle); padding: var(--space-2) var(--space-3);
  }
  :global(.menu-sep) { height: 1px; background: var(--color-border); margin: var(--space-1) 0; }
</style>
