<script lang="ts">
  import { goto } from "$app/navigation";
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  let { theme, onTheme, onSignOut }: { theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void } = $props();
  let q = $state("");
</script>

<header class="topbar">
  <a class="brand" href="/">readme<span>pls</span></a>
  <nav>
    <a href="/">extract</a>
    <a href="/library">library</a>
  </nav>
  <form class="search" onsubmit={(e) => { e.preventDefault(); if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`); }}>
    <input bind:value={q} placeholder="search…" aria-label="search library" />
  </form>
  <div class="right">
    <div class="themes" role="group" aria-label="theme">
      {#each THEMES as t}
        <button
          type="button"
          aria-pressed={theme === t}
          data-active={theme === t}
          onclick={() => onTheme(t)}>{t}</button>
      {/each}
    </div>
    <button type="button" class="signout" onclick={onSignOut}>sign out</button>
  </div>
</header>

<style>
  .topbar {
    display: flex; align-items: center; gap: 1.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .brand { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; color: var(--color-text); text-decoration: none; }
  .brand span { color: var(--color-accent); }
  nav { display: flex; gap: 1rem; }
  nav a { font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
  nav a:hover { color: var(--color-text); }
  .right { margin-left: auto; display: flex; align-items: center; gap: 1rem; }
  .themes { display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
  .themes button { font-family: var(--font-display); font-size: 0.8rem; padding: 0.25rem 0.6rem; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .themes button[data-active="true"] { background: var(--color-accent-wash); color: var(--color-text); }
  .themes button:focus-visible, .signout:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .signout { font-family: var(--font-display); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
  .signout:hover { color: var(--color-text); }
  .search { display: flex; flex: 1; max-width: 20rem; }
  .search input {
    width: 100%;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    padding: 0.3rem 0.65rem;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    outline: none;
  }
  .search input::placeholder { color: var(--color-text-subtle); }
  .search input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px var(--color-accent-wash); }
</style>
