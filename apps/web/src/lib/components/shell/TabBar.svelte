<script lang="ts">
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import { House, Library, Ellipsis } from "@lucide/svelte";
  import { NAV_ITEMS, activeKey } from "$lib/shell/nav.js";
  import { nextNavVisible } from "$lib/components/bottom-nav-scroll.js";

  let {
    pathname,
    onMore,
    moreOpen,
  }: { pathname: string; onMore: () => void; moreOpen: boolean } = $props();

  const active = $derived(activeKey(pathname));
  // Collections and Settings live behind More, so More owns their active state.
  const moreActive = $derived(
    active === "collections" || active === "settings",
  );
  const icons = { home: House, library: Library } as const;

  let scrollVisible = $state(true);
  // The More sheet is open from this bar, so keep it shown meanwhile.
  const visible = $derived(scrollVisible || moreOpen);

  onMount(() => {
    let prevY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const curY = window.scrollY;
        scrollVisible = nextNavVisible(prevY, curY, scrollVisible);
        prevY = curY;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  const tab =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs font-medium text-muted-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-foreground";
</script>

<nav
  aria-label="Tabs"
  inert={!visible}
  class="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around rounded-t-xl bg-card px-2 pt-1 pb-[env(safe-area-inset-bottom)] ring-1 ring-hairline transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden {visible
    ? ''
    : 'translate-y-full'}"
>
  {#each NAV_ITEMS as item (item.key)}
    {@const Icon = icons[item.key]}
    {@const isActive = active === item.key}
    <a
      href={resolve(item.href)}
      aria-current={isActive ? "page" : undefined}
      class={tab}
    >
      <Icon class="size-5" aria-hidden="true" />
      <span class={isActive ? "marker" : undefined}>{item.label}</span>
    </a>
  {/each}
  <button
    type="button"
    aria-expanded={moreOpen}
    aria-current={moreActive ? "page" : undefined}
    class={tab}
    onclick={onMore}
  >
    <Ellipsis class="size-5" aria-hidden="true" />
    <span class={moreActive ? "marker" : undefined}>More</span>
  </button>
</nav>
