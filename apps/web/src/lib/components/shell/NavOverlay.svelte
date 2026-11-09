<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { WIDE_QUERY } from "$lib/shell/nav.js";
  import { invalidateAll } from "$app/navigation";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import type { CollectionSummary } from "$lib/collections/types.js";
  import { closeOnLink } from "$lib/shell/close-on-link.js";
  import AppSidebar from "./AppSidebar.svelte";
  import MoreSheet from "./MoreSheet.svelte";

  let {
    open,
    onClose,
    pathname,
    collections,
  }: {
    open: boolean;
    onClose: () => void;
    pathname: string;
    collections: CollectionSummary[];
  } = $props();

  // Same breakpoint the app shell swaps sidebar for tabs at.
  const wide = new MediaQuery(WIDE_QUERY);
  const onLinkClick = $derived(closeOnLink(onClose));
</script>

<!-- The reader has no app chrome of its own; this brings the whole nav in
     on demand: the sidebar on tablet/desktop, the More sheet on phones. -->
{#if wide.current}
  <Sheet.Root {open} onOpenChange={(next) => !next && onClose()}>
    <Sheet.Content side="left" class="gap-0 p-0 data-[side=left]:w-auto">
      <Sheet.Title class="sr-only">Navigation</Sheet.Title>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div onclick={onLinkClick}>
        <AppSidebar {pathname} {collections} onCreated={invalidateAll} />
      </div>
    </Sheet.Content>
  </Sheet.Root>
{:else}
  <MoreSheet
    {open}
    {onClose}
    {pathname}
    {collections}
    onCreated={invalidateAll}
    withNav
  />
{/if}
