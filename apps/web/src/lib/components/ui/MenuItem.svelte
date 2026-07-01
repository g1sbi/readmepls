<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu } from "bits-ui";

  let {
    children,
    onSelect,
    variant = "default",
  }: {
    children: Snippet;
    onSelect: () => void;
    variant?: "default" | "danger";
  } = $props();
</script>

<DropdownMenu.Item class="menu-item" data-variant={variant} onSelect={() => onSelect()}>
  {@render children()}
</DropdownMenu.Item>
