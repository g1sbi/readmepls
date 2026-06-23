<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    children,
    onclick,
    type = "button",
    disabled = false,
    variant = "default",
  }: {
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
    type?: "button" | "submit";
    disabled?: boolean;
    variant?: "default" | "accent";
  } = $props();
</script>

<button {type} {disabled} {onclick} data-variant={variant}>
  {@render children?.()}
</button>

<style>
  button {
    font-family: var(--font-display);
    font-size: var(--text-sm, 0.95rem);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: var(--radius-pill);
    padding: 0.5rem 1.1rem;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  button:hover:not(:disabled) { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
  button:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  button[data-variant="accent"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-on-accent);
  }
  button[data-variant="accent"]:hover:not(:disabled) { background: var(--color-accent-hover); }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    button:hover:not(:disabled) { transform: none; }
  }
</style>
