<script lang="ts">
  import { resolve } from "$app/paths";
  import { Settings } from "@lucide/svelte";
  import { activeKey, activeCollectionSlug } from "$lib/shell/nav.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import GetExtensionButton from "$lib/components/GetExtensionButton.svelte";
  import NewCollection from "./NewCollection.svelte";
  import SidebarCollections from "./SidebarCollections.svelte";
  import NavRows from "./NavRows.svelte";
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
    <NavRows {pathname} />

    <NewCollection bind:headingId={collectionsHeadingId} {onCreated} />

    <SidebarCollections
      {collections}
      {activeSlug}
      labelledby={collectionsHeadingId}
    />
  </div>

  <div class="flex flex-col gap-2 border-t border-hairline px-3 py-3">
    <GetExtensionButton class="self-start" />
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
