<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { ArrowLeft, Search, Menu, Highlighter } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import { trackTopbarHeight } from "$lib/actions/track-topbar-height.js";
  import { cn } from "$lib/utils.js";
  import { DESKTOP_QUERY } from "$lib/shell/nav.js";

  let {
    backHref,
    hidden,
    onMenu,
    title,
    showTitle = false,
    highlightsCount = 0,
    onHighlights,
    actions,
  }: {
    backHref: string;
    hidden: boolean;
    onMenu: () => void;
    title?: string;
    showTitle?: boolean;
    highlightsCount?: number;
    onHighlights?: () => void;
    actions?: Snippet;
  } = $props();

  // The focused layout's breakpoint: above it the header carries the article's
  // tools (and never slides away), below it the phone bar does. Off-screen
  // controls mustn't stay tabbable.
  const desktop = new MediaQuery(DESKTOP_QUERY);
</script>

<!-- Sticky over the article; publishes its height so the reader's sticky
     rail and highlights column pin below it. Slides away on scroll-down
     below lg only -- the focused layout has room to keep it. -->
<header
  use:trackTopbarHeight
  inert={hidden && !desktop.current}
  class={cn(
    "sticky top-0 z-20 flex items-center gap-2 bg-background/90 pt-[env(safe-area-inset-top)] pb-2 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none",
    hidden && "max-lg:-translate-y-full",
  )}
>
  <!-- backHref is a vetted in-app path (readerBackTarget). -->
  <Button variant="ghost" href={backHref} class="-ml-3 px-3">
    <ArrowLeft aria-hidden="true" />
    Back
  </Button>
  {#if desktop.current && title}
    <span
      aria-hidden={showTitle ? undefined : "true"}
      class={cn(
        "text-muted-foreground pointer-events-none absolute left-1/2 max-w-[40%] -translate-x-1/2 truncate text-sm font-medium transition-opacity duration-200 ease-out motion-reduce:transition-none",
        showTitle ? "opacity-100" : "opacity-0",
      )}>{title}</span
    >
  {/if}
  <div class="ml-auto flex shrink-0 items-center gap-2">
    <Button
      variant="outline"
      size="icon"
      aria-label="Search"
      onclick={() => searchPalette.open()}
    >
      <Search aria-hidden="true" />
    </Button>
    {#if desktop.current && onHighlights}
      <Button
        variant="outline"
        aria-label={`Highlights, ${highlightsCount}`}
        class="gap-1.5 px-3 tabular-nums"
        onclick={onHighlights}
      >
        <Highlighter aria-hidden="true" />
        {highlightsCount}
      </Button>
    {/if}
    {#if desktop.current && actions}{@render actions()}{/if}
    <Button
      variant="ghost"
      size="icon"
      aria-label="Open navigation"
      onclick={onMenu}
    >
      <Menu aria-hidden="true" />
    </Button>
  </div>
</header>
