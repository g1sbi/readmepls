<script lang="ts">
  import { resolve } from "$app/paths";
  import { Settings } from "@lucide/svelte";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import { activeKey, activeCollectionSlug } from "$lib/shell/nav.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import NewCollection from "./NewCollection.svelte";
  import SidebarCollections from "./SidebarCollections.svelte";
  import { sidebarRow } from "./sidebar-row.js";
  import { closeOnLink } from "$lib/shell/close-on-link.js";
  import NavRows from "./NavRows.svelte";

  let {
    open,
    onClose,
    pathname,
    collections,
    onCreated,
    withNav = false,
  }: {
    open: boolean;
    onClose: () => void;
    pathname: string;
    collections: CollectionSummary[];
    onCreated: () => void;
    /** Lead with Home and Library, for surfaces that have no tab bar. */
    withNav?: boolean;
  } = $props();

  const active = $derived(activeKey(pathname));
  const activeSlug = $derived(activeCollectionSlug(pathname));
  let collectionsHeadingId = $state("");

  const onLinkClick = $derived(closeOnLink(onClose));
</script>

<BottomSheet {open} {onClose} title="More">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div onclick={onLinkClick}>
    {#if withNav}<NavRows {pathname} />{/if}
    <a
      href={resolve("/settings")}
      aria-current={active === "settings" ? "page" : undefined}
      class={sidebarRow(active === "settings")}
    >
      <Settings class="size-4 shrink-0" aria-hidden="true" />
      Settings
    </a>

    <NewCollection bind:headingId={collectionsHeadingId} {onCreated} />

    <div data-more-scroll class="max-h-[50dvh] overflow-y-auto">
      <SidebarCollections
        {collections}
        {activeSlug}
        labelledby={collectionsHeadingId}
      />
    </div>
  </div>
</BottomSheet>
