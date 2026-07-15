<script lang="ts">
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";
  import "../app.css";
  import "$lib/styles/shadcn-bridge.css";
  import { onMount, setContext } from "svelte";
  import { goto, onNavigate } from "$app/navigation";
  import { shouldAnimateNavigation } from "$lib/view-transition.js";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { resolveTheme, applyTheme, readStoredTheme, type Theme } from "$lib/theme/theme.js";
  import { releaseTransformContainingBlock } from "$lib/actions/release-transform-containing-block.js";
  import TopBar from "$lib/components/TopBar.svelte";
  import BottomNav from "$lib/components/BottomNav.svelte";

  let { children } = $props();
  const pb = browserPb();
  let theme = $state<Theme>("light");
  let readProgress = $state(0);

  // Expose the global theme model to descendants so the reader page can keep
  // its article in sync with the chrome rather than maintaining a parallel state.
  setContext("theme", {
    get current() { return theme; },
    set: (t: Theme) => setTheme(t),
  });

  // The reading-progress strip must render as a sibling of .page, not a
  // descendant: .page is `position: relative; z-index: 1`, which makes it a
  // stacking context of its own, capping any z-index set on a descendant at
  // rank 1 -- no z-index inside .page can ever outrank TopBar (a .page
  // sibling). Lifting the element up here (same fix pattern as the portaled
  // Sheet) lets it sit in the same stacking context as TopBar and actually
  // overlay it.
  setContext("readProgress", {
    set: (p: number) => { readProgress = p; },
  });

  // Cross-route view transition (global cross-fade). Feature-detected and
  // reduced-motion-guarded by shouldAnimateNavigation; resolves per the
  // SvelteKit onNavigate + startViewTransition pattern.
  onNavigate((navigation) => {
    if (typeof document === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!shouldAnimateNavigation(document, mql)) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // Chrome (TopBar + paper bg) is hidden on the standalone login screen.
  const chrome = $derived($page.url.pathname !== "/login");
  // The reader's own 3-column layout (rail + article + highlights) needs more
  // room than card-grid pages, which stay at --width-page so cards don't stretch.
  const isReader = $derived($page.url.pathname.startsWith("/read/"));

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
  {#if $page.url.pathname.startsWith("/read/")}
    <div class="progress" style="--p: {readProgress}" aria-hidden="true"></div>
  {/if}
  <div class="page" class:page--wide={isReader} use:releaseTransformContainingBlock>{@render children()}</div>
  {#if chrome}
    <BottomNav pathname={$page.url.pathname} />
  {/if}
</div>

<style>
  .app { min-height: 100dvh; background: var(--color-bg-gradient); position: relative; }
  .app::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: var(--grain-opacity); mix-blend-mode: multiply;
  }
  .page { position: relative; z-index: 1; max-width: var(--width-page); margin: 0 auto; padding: 1.5rem 1.25rem; animation: reveal var(--dur-slow) var(--ease-paper) both; }
  .page--wide { max-width: var(--width-reader); }
  @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  /* z-index above TopBar's sticky header (20) -- both sit at top:0, and the
     reading-progress strip is meant to overlay the chrome, not hide behind it. */
  .progress { position: fixed; top: 0; left: 0; height: 3px; width: calc(var(--p) * 100%); background: var(--color-accent); z-index: 21; transition: width var(--dur-fast) var(--ease-out); }
  @media (prefers-reduced-motion: reduce) { .progress { transition: none; } }
  @media (prefers-reduced-motion: reduce) { .page { animation: none; } }
  @media (max-width: 640px) {
    .page { padding-bottom: calc(56px + env(safe-area-inset-bottom) + 1rem); }
  }
</style>
