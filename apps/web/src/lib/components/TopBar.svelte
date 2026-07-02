<script lang="ts">
  import { goto } from "$app/navigation";
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  import { Search, Library, Sun, Moon, Coffee, LogOut } from "@lucide/svelte";

  // Theme → icon map; theme text label stays the accessible name.
  const themeIcon = { light: Sun, dark: Moon, sepia: Coffee } as const;

  let { theme, onTheme, onSignOut }: { theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void } = $props();
  let q = $state("");
</script>

<header class="topbar">
  <a class="brand" href="/">readme<span>pls</span></a>
  <nav>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
  </nav>
  <form class="search" onsubmit={(e) => { e.preventDefault(); if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`); }}>
    <Search class="icon-sm search-icon" aria-hidden="true" />
    <input bind:value={q} placeholder="search…" aria-label="search library" />
  </form>
  <div class="right">
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
    <button type="button" class="signout" onclick={onSignOut}><LogOut class="icon-sm" aria-hidden="true" />sign out</button>
  </div>
</header>

<style>
  .topbar {
    display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
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
  .themes button:focus-visible, .signout:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .signout { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
  .signout:hover { color: var(--color-text); }
  .search { display: flex; flex: 1; max-width: 20rem; position: relative; align-items: center; }
  .search :global(.search-icon) { position: absolute; left: 0.6rem; color: var(--color-text-subtle); pointer-events: none; }
  .search input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 0.3rem 0.65rem 0.3rem 1.9rem; /* left pad for the icon */
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    outline: none;
  }
  .search input::placeholder { color: var(--color-text-subtle); }
  .search input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px var(--color-accent-wash); }
  @media (max-width: 640px) {
    .topbar { gap: 0.6rem; }
    .search { order: 3; flex-basis: 100%; max-width: none; }
    .right { gap: 0.6rem; }
    .themes button .label {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
  }
</style>
