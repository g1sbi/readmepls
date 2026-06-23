<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { withReaderDefaults } from "@readmepls/core";
  import type { ReaderPrefs } from "@readmepls/types";
  import { readerCssVars } from "$lib/reader/css-vars.js";
  import ReaderControls from "$lib/components/ReaderControls.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";

  const pb = browserPb();
  let article = $state<any>(null);
  let content = $state<any>(null);
  let prefs = $state<ReaderPrefs>(withReaderDefaults());

  let progress = $state(0);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function savePrefs(next: ReaderPrefs) {
    prefs = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const uid = pb.authStore.model?.id;
      if (uid) pb.collection("users").update(uid, { reader_prefs: next });
    }, 500);
  }

  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      const max = document.body.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      progress = p;
      if (article) pb.collection("articles").update(article.id, { progress: p });
    }, 400);
  }

  onMount(async () => {
    const id = $page.params.id;
    if (!id) return;
    article = await pb.collection("articles").getOne(id, { expand: "content" });
    content = article.expand?.content ?? null;

    const uid = pb.authStore.model?.id;
    if (uid) {
      const me = await pb.collection("users").getOne(uid);
      prefs = withReaderDefaults(me.reader_prefs ?? undefined);
    }
    if (article.status === "unread") {
      await pb.collection("articles").update(article.id, { status: "reading" });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  });

  // An async onMount can't register a cleanup; tear down the listener here.
  onDestroy(() => {
    if (typeof window !== "undefined") window.removeEventListener("scroll", onScroll);
  });

  async function archive() {
    if (article) await pb.collection("articles").update(article.id, { status: "archived" });
  }
</script>

<div class="progress" style="--p: {progress}" aria-hidden="true"></div>
<div class="reader-shell">
  <div class="bar">
    <a class="back" href="/library">← library</a>
    <ReaderControls {prefs} onChange={savePrefs} />
    <Button onclick={archive}>Archive</Button>
  </div>

  {#if !content}
    <Spinner label="Loading article" />
  {:else}
    <article data-theme={prefs.theme} style={readerCssVars(prefs)} class="reader">
      <h1>{content.title}</h1>
      <!-- content_html is sanitized in the worker (Task 2) before storage -->
      {@html content.content_html}
    </article>
  {/if}
</div>

<style>
  .progress { position: fixed; top: 0; left: 0; height: 3px; width: calc(var(--p) * 100%); background: var(--color-accent); z-index: 10; transition: width var(--dur-fast) var(--ease-out); }
  .reader-shell { max-width: 68ch; margin: 0 auto; }
  .bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .bar .back { font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
  .bar .back:hover { color: var(--color-text); }
  .reader {
    background: var(--reading-bg); color: var(--reading-text);
    font-family: var(--reading-font); font-size: var(--reading-size);
    line-height: var(--reading-leading); max-width: var(--reading-measure);
    margin: 0 auto; padding: 1.5rem; border-radius: var(--radius-lg);
  }
  .reader :global(h1) { font-family: var(--font-display); line-height: 1.15; }
  .reader :global(a) { color: var(--color-accent); }
  .reader :global(pre), .reader :global(code) { font-family: var(--font-mono); }
  .reader :global(pre) { background: var(--color-surface-sunken); padding: 1rem; border-radius: var(--radius-md); overflow-x: auto; }
  .reader :global(blockquote) { border-left: 3px solid var(--color-accent); margin: 1rem 0; padding-left: 1rem; color: var(--color-text-muted); }
  .reader :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-md); }
  @media (prefers-reduced-motion: reduce) { .progress { transition: none; } }
</style>
