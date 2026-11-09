<script lang="ts">
  import { resolve } from "$app/paths";
  import { House, Library, Settings } from "@lucide/svelte";
  import {
    NAV_ITEMS,
    activeKey,
    activeCollectionSlug,
  } from "$lib/shell/nav.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import NewCollection from "./NewCollection.svelte";
  import SidebarCollections from "./SidebarCollections.svelte";
  import { sidebarRow } from "./sidebar-row.js";

  let {
    pathname,
    collections,
    onCreated,
  }: {
    pathname: string;
    collections: CollectionSummary[];
    onCreated: () => void;
  } = $props();

  const active = $derived(activeKey(pathname));
  const activeSlug = $derived(activeCollectionSlug(pathname));
  let collectionsHeadingId = $state("");

  const icons = { home: House, library: Library } as const;
</script>

<nav
  aria-label="Main"
  class="flex h-dvh w-60 shrink-0 flex-col bg-background ring-1 ring-hairline"
>
  <div class="px-5 pt-6 pb-4">
    <a
      href={resolve("/")}
      class="font-display text-xl font-semibold tracking-tight text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >readme<span class="marker">pls</span></a
    >
  </div>

  <div data-sidebar-scroll class="flex-1 overflow-y-auto px-3 pb-4">
    <ul class="flex flex-col gap-0.5">
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

    <NewCollection bind:headingId={collectionsHeadingId} {onCreated} />

    <SidebarCollections
      {collections}
      {activeSlug}
      labelledby={collectionsHeadingId}
    />
  </div>

  <div class="border-t border-hairline px-3 py-3">
    <a
      href={resolve("/settings")}
      aria-current={active === "settings" ? "page" : undefined}
      class={sidebarRow(active === "settings")}
    >
      <Settings class="size-4 shrink-0" aria-hidden="true" />
      Settings
    </a>
  </div>
</nav>
