<script lang="ts">
  import DropdownMenu from "../DropdownMenu.svelte";
  import MenuItem from "../MenuItem.svelte";
  let { onpick }: { onpick: () => void } = $props();
</script>

<DropdownMenu label="open menu">
  {#snippet trigger()}<span>⋯</span>{/snippet}
  {#snippet children()}
    <div class="menu-label">actions</div>
    <MenuItem onSelect={onpick}>pick me</MenuItem>
  {/snippet}
</DropdownMenu>
