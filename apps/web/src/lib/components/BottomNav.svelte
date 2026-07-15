<script lang="ts">
  import { onMount } from "svelte";
  import { Library, Search, FolderOpen, User } from "@lucide/svelte";
  import { nextNavVisible } from "./bottom-nav-scroll.js";

  let { pathname }: { pathname: string } = $props();

  const TABS = [
    { href: "/library", label: "library", icon: Library, match: (p: string) => p === "/library" || p.startsWith("/read") },
    { href: "/library?focus=search", label: "search", icon: Search, match: (_p: string) => false },
    { href: "/collections", label: "collections", icon: FolderOpen, match: (p: string) => p.startsWith("/collections") },
    { href: "/profile", label: "profile", icon: User, match: (p: string) => p === "/profile" },
  ];

  let visible = $state(true);

  onMount(() => {
    let prevY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const curY = window.scrollY;
        visible = nextNavVisible(prevY, curY, visible);
        prevY = curY;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });
</script>

<nav class="bottom-nav" data-visible={visible} aria-label="primary">
  {#each TABS as tab (tab.label)}
    {@const Icon = tab.icon}
    <a href={tab.href} aria-current={tab.match(pathname) ? "page" : undefined}>
      <Icon class="icon-sm" aria-hidden="true" />
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    display: none; /* desktop: hidden */
    justify-content: space-around; align-items: stretch;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    transition: transform var(--dur-base) var(--ease-paper);
  }
  .bottom-nav[data-visible="false"] { transform: translateY(100%); }
  .bottom-nav a {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 56px; padding: 0.4rem 0;
    font-family: var(--font-ui); font-size: 0.7rem;
    color: var(--color-text-muted); text-decoration: none;
  }
  .bottom-nav a[aria-current="page"] { color: var(--color-accent); }
  @media (max-width: 640px) { .bottom-nav { display: flex; } }
  @media (prefers-reduced-motion: reduce) { .bottom-nav { transition: none; } }
</style>
