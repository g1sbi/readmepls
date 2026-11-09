<script lang="ts">
  import { resolve } from "$app/paths";
  import { Settings } from "@lucide/svelte";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import { activeKey } from "$lib/shell/nav.js";
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
  const activeSlug = $derived.by(() => {
    if (active !== "collections") return null;
    const seg = pathname.split(/[?#]/)[0]?.split("/")[2];
    if (!seg) return null;
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  });

  // Any link tap navigates, so the sheet gets out of the way.
  function closeOnLink(e: MouseEvent) {
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

    <NewCollection headingId="more-collections-heading" {onCreated} />

    <div data-more-scroll class="max-h-[50dvh] overflow-y-auto">
      <SidebarCollections
        {collections}
        {activeSlug}
        labelledby="more-collections-heading"
      />
    </div>
  </div>
</BottomSheet>
