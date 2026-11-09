<script lang="ts">
  import { resolve } from "$app/paths";
  import { Settings } from "@lucide/svelte";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import { activeKey, activeCollectionSlug } from "$lib/shell/nav.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import NewCollection from "./NewCollection.svelte";
  import SidebarCollections from "./SidebarCollections.svelte";
  import { sidebarRow } from "./sidebar-row.js";

  let {
    open,
    onClose,
    pathname,
    collections,
    onCreated,
  }: {
    open: boolean;
    onClose: () => void;
    pathname: string;
    collections: CollectionSummary[];
    onCreated: () => void;
  } = $props();

  const active = $derived(activeKey(pathname));
  const activeSlug = $derived(activeCollectionSlug(pathname));
  let collectionsHeadingId = $state("");

  // A plain link tap navigates, so the sheet gets out of the way. Modified
  // clicks (new tab/window) leave the page in place, so they leave it open.
  function closeOnLink(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if ((e.target as Element).closest("a")) onClose();
  }
</script>

<BottomSheet {open} {onClose} title="More">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div onclick={closeOnLink}>
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
