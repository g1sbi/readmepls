<script lang="ts">
  import { resolve } from "$app/paths";
  import { House, Library } from "@lucide/svelte";
  import { NAV_ITEMS, activeKey } from "$lib/shell/nav.js";
  import { sidebarRow } from "./sidebar-row.js";

  let { pathname }: { pathname: string } = $props();

  const active = $derived(activeKey(pathname));
  const icons = { home: House, library: Library } as const;
</script>

<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
  {#each NAV_ITEMS as item (item.key)}
    {@const Icon = icons[item.key]}
    {@const isActive = active === item.key}
    <li>
      <a
        href={resolve(item.href)}
        aria-current={isActive ? "page" : undefined}
        class={sidebarRow(isActive)}
      >
        <Icon class="size-4 shrink-0" aria-hidden="true" />
        {item.label}
      </a>
    </li>
  {/each}
</ul>
