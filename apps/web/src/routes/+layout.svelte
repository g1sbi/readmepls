<script lang="ts">
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";
  import "../app.css";
  import { onMount, setContext } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { resolveTheme, applyTheme, readStoredTheme, type Theme } from "$lib/theme/theme.js";
  import TopBar from "$lib/components/TopBar.svelte";

  let { children } = $props();
  const pb = browserPb();
  let theme = $state<Theme>("light");

  // Expose the global theme model to descendants so the reader page can keep
  // its article in sync with the chrome rather than maintaining a parallel state.
  setContext("theme", {
    get current() { return theme; },
    set: (t: Theme) => setTheme(t),
  });

  // Chrome (TopBar + paper bg) is hidden on the standalone login screen.
  const chrome = $derived($page.url.pathname !== "/login");

  onMount(() => {
    const prefTheme = pb.authStore.model?.reader_prefs?.theme ?? null;
    theme = resolveTheme(readStoredTheme(), prefTheme);
    applyTheme(theme);
  });

  function setTheme(t: Theme) {
    theme = t;
    applyTheme(t);
    const uid = pb.authStore.model?.id;
    if (uid) {
      const prev = pb.authStore.model?.reader_prefs ?? {};
      pb.collection("users").update(uid, { reader_prefs: { ...prev, theme: t } });
    }
  }

  async function signOut() {
    pb.authStore.clear();
    await goto("/login");
  }
</script>

<div class="app">
  {#if chrome}
    <TopBar {theme} onTheme={setTheme} onSignOut={signOut} />
  {/if}
  <div class="page">{@render children()}</div>
</div>

<style>
  .app { min-height: 100dvh; background: var(--color-bg-gradient); position: relative; }
  .app::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: var(--grain-opacity); mix-blend-mode: multiply;
  }
  .page { position: relative; z-index: 1; max-width: var(--width-page); margin: 0 auto; padding: 1.5rem 1.25rem; animation: reveal var(--dur-slow) var(--ease-paper) both; }
  @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .page { animation: none; } }
</style>
