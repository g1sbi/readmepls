<script lang="ts">
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import { Search, Library, Sun, Moon, Coffee, LogOut, Menu } from "@lucide/svelte";

  // Theme → icon map; theme text label stays the accessible name.
  const themeIcon = { light: Sun, dark: Moon, sepia: Coffee } as const;

  let { theme, onTheme, onSignOut }: { theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void } = $props();
  let menuOpen = $state(false);
</script>

{#snippet themeControls()}
  <div class="themes" role="group" aria-label="theme">
    {#each THEMES as t}
      {@const Icon = themeIcon[t]}
      <button
        type="button"
        aria-pressed={theme === t}
        data-active={theme === t}
        onclick={() => onTheme(t)}><Icon class="icon-sm" aria-hidden="true" /><span class="label">{t}</span></button>
    {/each}
  </div>
{/snippet}

{#snippet signOutButton()}
  <button type="button" class="signout" onclick={onSignOut}><LogOut class="icon-sm" aria-hidden="true" />sign out</button>
{/snippet}

<header class="topbar">
  <a class="brand" href="/">readme<span>pls</span></a>
  <nav>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
  </nav>
  <button type="button" class="search-trigger" onclick={() => searchPalette.open()}>
    <Search class="icon-sm" aria-hidden="true" />
    <span class="search-label">search your library…</span>
    <kbd class="search-kbd">⌘K</kbd>
  </button>
  <div class="right">
    {@render themeControls()}
    {@render signOutButton()}
  </div>
  <button type="button" class="menu-btn" aria-label="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = true)}>
    <Menu class="icon-sm" aria-hidden="true" />
  </button>
</header>

<Sheet open={menuOpen} onClose={() => (menuOpen = false)} title="menu">
  <div class="sheet-menu">
    {@render themeControls()}
    {@render signOutButton()}
  </div>
</Sheet>

<style>
  .topbar {
    display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky; top: 0; z-index: 20; /* below the reading-progress strip (z-index: 21), which overlays the chrome */
  }
  .brand { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; color: var(--color-text); text-decoration: none; }
  .brand span { color: var(--color-accent); }
  nav { display: flex; gap: var(--space-4); }
  nav a { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); color: var(--color-text-muted); text-decoration: none; }
  nav a:hover { color: var(--color-text); }
  .right { margin-left: auto; display: flex; align-items: center; gap: var(--space-4); }
  .themes { display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
  .themes button { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.8rem; padding: 0.25rem 0.6rem; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .themes button[data-active="true"] { background: var(--color-accent-wash); color: var(--color-text); }
  .themes button:focus-visible, .signout:focus-visible, .menu-btn:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .signout { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
  .signout:hover { color: var(--color-text); }
  .search-trigger {
    display: flex; flex: 1; max-width: 20rem; align-items: center; gap: var(--space-2);
    min-height: 44px; padding: 0.3rem 0.65rem;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-subtle);
    font-family: var(--font-ui); font-size: var(--text-sm);
    cursor: pointer; text-align: left;
  }
  .search-trigger:hover { border-color: var(--color-ring); }
  .search-trigger:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .search-label { flex: 1; }
  .search-kbd { font-family: var(--font-ui); font-size: var(--text-xs); padding: 0.1rem 0.35rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }

  /* Menu button is desktop-hidden; revealed on mobile. */
  .menu-btn { display: none; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; margin-left: auto; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }

  /* Mobile menu (Sheet) rows are full-size touch targets with visible labels. */
  .sheet-menu { display: flex; flex-direction: column; gap: var(--space-3); }
  .sheet-menu .themes { flex-direction: column; border-radius: var(--radius-md); }
  .sheet-menu .themes button { min-height: 44px; justify-content: flex-start; font-size: var(--text-sm); padding: 0 var(--space-3); }
  .sheet-menu .signout { min-height: 44px; justify-content: flex-start; font-size: var(--text-sm); }

  @media (max-width: 640px) {
    .topbar { gap: 0.6rem; flex-wrap: nowrap; }
    nav, .search-trigger, .right { display: none; } /* moved to bottom nav / menu sheet */
    .menu-btn { display: inline-flex; }
    /* Keep labels visible inside the menu sheet even on mobile. */
    .sheet-menu .themes button .label { position: static; width: auto; height: auto; clip: auto; margin: 0; }
  }
</style>
