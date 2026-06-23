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
