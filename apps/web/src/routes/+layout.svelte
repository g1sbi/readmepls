<script lang="ts">
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";
  import "$lib/styles/marker.css";
  import "../app.css";
  import "$lib/styles/shadcn-bridge.css";
  import { onMount, setContext, type Snippet } from "svelte";
  import { afterNavigate, invalidateAll, onNavigate } from "$app/navigation";
  import { shouldAnimateNavigation } from "$lib/view-transition.js";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import {
    resolveThemePref,
    resolveMode,
    migrateStoredTheme,
    applyTheme,
    watchSystemMode,
    type ThemePref,
    type Mode,
  } from "$lib/theme/theme.js";
  import { releaseTransformContainingBlock } from "$lib/actions/release-transform-containing-block.js";
  import SearchPalette from "$lib/components/SearchPalette.svelte";
  import AppSidebar from "$lib/components/shell/AppSidebar.svelte";
  import TabBar from "$lib/components/shell/TabBar.svelte";
  import MoreSheet from "$lib/components/shell/MoreSheet.svelte";
  import { shellFor } from "$lib/shell/nav.js";
  import { handleSearchKeydown } from "$lib/search/handle-keydown.js";
  import { initExtensionDetection } from "$lib/stores/extension.svelte.js";
  import type { LayoutData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  const pb = browserPb();
  let theme = $state<ThemePref>("system");
  let mode = $state<Mode>("light");
  let unwatchSystem: (() => void) | undefined;
  let readProgress = $state(0);

  // Expose the global theme model to descendants so the reader page can keep
  // its article in sync with the chrome rather than maintaining a parallel state.
  setContext("theme", {
    get current() {
      return theme;
    },
    get mode() {
      return mode;
    },
    set: (t: ThemePref) => setTheme(t),
  });

  // The reading-progress strip must render as a sibling of .page, not a
  // descendant: .page is `position: relative; z-index: 1`, which makes it a
  // stacking context of its own, capping any z-index set on a descendant at
  // rank 1 -- no z-index inside .page could ever outrank the reader's sticky
  // header. Lifting the element up here (same fix pattern as the portaled
  // Sheet) lets it overlay the chrome.
  setContext("readProgress", {
    set: (p: number) => {
      readProgress = p;
    },
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

  const pathname = $derived($page.url.pathname);
  // "app": sidebar (md+) or tab bar (phones); "reader": the article owns its
  // own chrome; "none": standalone auth screens.
  const shell = $derived(shellFor(pathname));
  let moreOpen = $state(false);
  // Any navigation -- a link inside the sheet, back/forward, a search pick --
  // lands on a new page; the sheet shouldn't still be covering it.
  afterNavigate(() => (moreOpen = false));

  // Search belongs to the signed-in surfaces, not the auth screens.
  function onWindowKeydown(e: KeyboardEvent) {
    if (shell !== "none") handleSearchKeydown(e);
  }

  function systemPrefersDark(): boolean {
    try {
      return matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  }

  // Apply a pref, and follow the OS live only while it is "system".
  function activate(pref: ThemePref) {
    theme = pref;
    mode = resolveMode(pref, systemPrefersDark());
    try {
      applyTheme(pref, mode);
    } catch {
      document.documentElement.dataset.theme = mode;
    }
    unwatchSystem?.();
    unwatchSystem = undefined;
    if (pref === "system") {
      unwatchSystem = watchSystemMode((dark) => {
        mode = resolveMode("system", dark);
        document.documentElement.dataset.theme = mode;
      });
    }
  }

  onMount(() => {
    let stored: string | null = null;
    try {
      migrateStoredTheme(localStorage);
      stored = localStorage.getItem("theme");
    } catch {
      // storage blocked (private mode) -- fall through to account/system
    }
    const accountPref = pb.authStore.model?.reader_prefs?.theme ?? null;
    activate(resolveThemePref(stored, accountPref));
    initExtensionDetection();
    return () => unwatchSystem?.();
  });

  function setTheme(t: ThemePref) {
    activate(t);
    const uid = pb.authStore.model?.id;
    if (uid) {
      const prev = pb.authStore.model?.reader_prefs ?? {};
      pb.collection("users").update(uid, {
        reader_prefs: { ...prev, theme: t },
      });
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if shell === "app"}
  <div class="app grid md:grid-cols-[15rem_1fr]">
    <div class="sticky top-0 hidden h-dvh self-start md:flex">
      <AppSidebar
        {pathname}
        collections={data.collections}
        onCreated={invalidateAll}
      />
    </div>
    <!-- Bottom padding below md keeps content clear of the fixed tab bar. -->
    <main class="min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div class="page" use:releaseTransformContainingBlock>
        {@render children()}
      </div>
    </main>
  </div>
  <TabBar {pathname} {moreOpen} onMore={() => (moreOpen = !moreOpen)} />
  <MoreSheet
    open={moreOpen}
    onClose={() => (moreOpen = false)}
    {pathname}
    collections={data.collections}
    onCreated={invalidateAll}
  />
{:else if shell === "reader"}
  <div class="app">
    <div class="progress" style="--p: {readProgress}" aria-hidden="true"></div>
    <!-- The reader's 3-column layout (rail + article + highlights) needs more
         room than card-grid pages, which stay at --width-page. -->
    <div class="page page--wide" use:releaseTransformContainingBlock>
      {@render children()}
    </div>
  </div>
{:else}
  <div class="app">
    <div class="page" use:releaseTransformContainingBlock>
      {@render children()}
    </div>
  </div>
{/if}

{#if shell !== "none"}
  <SearchPalette />
{/if}

<style>
  .app {
    min-height: 100dvh;
    background: var(--color-bg);
    position: relative;
  }
  .page {
    position: relative;
    z-index: 1;
    max-width: var(--width-page);
    margin: 0 auto;
    padding: 1.5rem 1.25rem;
    animation: reveal var(--dur-slow) var(--ease-out) both;
  }
  .page--wide {
    max-width: var(--width-reader);
  }
  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  /* z-index above the reader's sticky header (20) -- both sit at top:0, and
     the reading-progress strip is meant to overlay the chrome. */
  .progress {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    width: calc(var(--p) * 100%);
    background: var(--color-accent);
    z-index: 21;
    transition: width var(--dur-fast) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .progress {
      transition: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
