<script lang="ts">
  import * as DropdownMenu from "../index.js";
  let { onpick }: { onpick: () => void } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger aria-label="open menu">⋯</DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Label>actions</DropdownMenu.Label>
    <DropdownMenu.Item onSelect={onpick}>pick me</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="destructive">remove</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
