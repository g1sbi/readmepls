<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { withReaderDefaults, anchoring, rangeOver } from "@readmepls/core";
  import { Highlight, type ReaderPrefs, type HighlightColor } from "@readmepls/types";
  import type { Theme } from "$lib/theme/theme.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import type { RecordModel } from "pocketbase";
  import { readerCssVars } from "$lib/reader/css-vars.js";
  import { markRange, unmarkAll } from "$lib/highlight/render";
  import ReaderControls from "$lib/components/ReaderControls.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";
  import HighlightPopover from "$lib/components/HighlightPopover.svelte";
  import HighlightsSidebar from "$lib/components/HighlightsSidebar.svelte";

  // Global theme context provided by +layout.svelte. May be undefined when
  // the reader is rendered in isolation (e.g. unit tests without the layout).
  const themeCtx = getContext<{ current: Theme; set: (t: Theme) => void } | undefined>("theme");

  const pb = browserPb();
  let article = $state<ArticleRecord | null>(null);
  let content = $state<RecordModel | null>(null);
  let prefs = $state<ReaderPrefs>(withReaderDefaults());

  let progress = $state(0);

  // Highlight state
  // eslint-disable-next-line prefer-const — reassigned by bind:this, not Svelte reactivity
  let bodyEl = $state<HTMLElement>(null!);
  let highlights = $state<Highlight[]>([]);
  let orphans = $state<string[]>([]);
  let popover = $state<{ x: number; y: number; range: Range } | null>(null);

  async function loadHighlights(articleId: string) {
    const raw = await pb.collection("highlights").getFullList({
      filter: pb.filter('article = {:id}', { id: articleId }), sort: "created",
    });
    highlights = raw.map((r) => Highlight.parse({
      id: r.id, user: r.user, article: r.article, text: r.text,
      prefix: r.prefix ?? "", suffix: r.suffix ?? "",
      startOffset: r.start_offset ?? 0, endOffset: r.end_offset ?? 0,
      color: r.color, note: r.note ?? "", created: r.created,
    }));
    await renderMarks();
  }

  async function renderMarks() {
    unmarkAll(bodyEl);
    const missing: string[] = [];
    for (const h of highlights) {
      const range = await anchoring.anchor(rangeOver(bodyEl), h);
      if (range) markRange(range, h.color, h.id);
      else missing.push(h.id);
    }
    orphans = missing;
  }

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyEl.contains(sel.anchorNode)) { popover = null; return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popover = { x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 4, range };
  }

  async function createHighlight(color: HighlightColor, note: string) {
    if (!popover) return;
    try {
      const sel = await anchoring.describe(rangeOver(bodyEl), popover.range);
      await pb.collection("highlights").create({
        user: pb.authStore.model?.id, article: $page.params.id,
        text: sel.text, prefix: sel.prefix, suffix: sel.suffix,
        start_offset: sel.startOffset, end_offset: sel.endOffset,
        color, note,
      });
      popover = null;
      window.getSelection()?.removeAllRanges();
      await loadHighlights($page.params.id!);
    } catch {
      popover = null; // bad selection — silently abort (see spec §10)
    }
  }

  function jumpTo(id: string) {
    bodyEl.querySelector(`mark[data-hl-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteHighlight(id: string) {
    await pb.collection("highlights").delete(id);
    await loadHighlights($page.params.id!);
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function savePrefs(next: ReaderPrefs) {
    // If theme changed, drive it through the global model (localStorage + <html>
    // data-theme + reader_prefs.theme) so the chrome and article agree.
    if (next.theme !== prefs.theme && themeCtx) {
      themeCtx.set(next.theme);
    }
    prefs = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const uid = pb.authStore.model?.id;
      if (uid) pb.collection("users").update(uid, { reader_prefs: next });
    }, 500);
  }

  // Derive the active theme: prefer the live global context (keeps article in
  // sync when TopBar changes theme) and fall back to local prefs for isolation.
  const activeTheme = $derived(themeCtx ? themeCtx.current : prefs.theme);

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
    // article is always non-null here — getOne throws on not-found
    content = article!.expand?.content ?? null;

    const uid = pb.authStore.model?.id;
    if (uid) {
      const me = await pb.collection("users").getOne(uid);
      prefs = withReaderDefaults(me.reader_prefs ?? undefined);
    }
    if (article!.status === "unread") {
      await pb.collection("articles").update(article!.id, { status: "reading" });
    }
    // Load highlights after article HTML is in the DOM (next tick).
    await Promise.resolve();
    await loadHighlights(id);
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
<!-- reader vars live on the shell so the width pref governs the shell, not just the article -->
<div class="reader-shell" style={readerCssVars(prefs)}>
  <div class="bar">
    <a class="back" href="/library">← library</a>
    <ReaderControls {prefs} onChange={savePrefs} />
    <Button onclick={archive}>Archive</Button>
  </div>

  {#if !content}
    <Spinner label="Loading article" />
  {:else}
    <!-- data-theme uses the live global context so TopBar changes retone the article (FIX 1) -->
    <!-- Svelte emits an a11y warning for onmouseup on a non-interactive <article>; accepted for text-selection in the reader. -->
    <article data-theme={activeTheme} class="reader" onmouseup={onMouseUp}>
      <h1>{content.title}</h1>
      <!-- content_html is sanitized in the worker (Task 2) before storage -->
      <!-- bind:this anchors the highlight anchoring scope to the article body -->
      <div bind:this={bodyEl}>
        {@html content.content_html}
      </div>
    </article>
  {/if}
</div>

{#if popover}
  <HighlightPopover x={popover.x} y={popover.y} onpick={createHighlight} oncancel={() => (popover = null)} />
{/if}

{#if content}
  <HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
{/if}

<style>
  .progress { position: fixed; top: 0; left: 0; height: 3px; width: calc(var(--p) * 100%); background: var(--color-accent); z-index: 10; transition: width var(--dur-fast) var(--ease-out); }
  /* --reading-measure is set inline on .reader-shell so the column width
     follows the pref (narrow/normal/wide) end-to-end (FIX 2). */
  .reader-shell { max-width: var(--reading-measure); margin: 0 auto; }
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
