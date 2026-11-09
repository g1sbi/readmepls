<script lang="ts">
  import { ArrowLeft, Search, Menu } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import { trackTopbarHeight } from "$lib/actions/track-topbar-height.js";
  import { cn } from "$lib/utils.js";

  let {
    backHref,
    hidden,
    onMenu,
  }: { backHref: string; hidden: boolean; onMenu: () => void } = $props();
</script>

<!-- Sticky over the article; publishes its height so the reader's sticky
     rail and highlights column pin below it. Slides away on scroll-down on
     phones only -- on wider screens there's room to keep it. -->
<header
  use:trackTopbarHeight
  class={cn(
    "sticky top-0 z-20 flex items-center gap-2 bg-background/90 pt-[env(safe-area-inset-top)] pb-2 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none",
    hidden && "max-md:-translate-y-full",
  )}
>
  <!-- backHref is a vetted in-app path (readerBackTarget). -->
  <Button variant="ghost" href={backHref} class="-ml-3 px-3">
    <ArrowLeft aria-hidden="true" />
    Back
  </Button>
  <div class="ml-auto flex shrink-0 items-center gap-2">
    <Button
      variant="outline"
      size="icon"
      aria-label="Search"
      onclick={() => searchPalette.open()}
    >
      <Search aria-hidden="true" />
    </Button>
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
