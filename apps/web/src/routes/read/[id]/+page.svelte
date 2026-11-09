<script lang="ts">
  import { onMount, onDestroy, getContext, tick } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { httpUrlOrNull } from "$lib/url/http-url.js";
  import {
    anchoring,
    rangeOver,
    slugify,
    STARTED_THRESHOLD,
    FINISHED_THRESHOLD,
  } from "@readmepls/core";
  import { Highlight, TocEntry, type HighlightColor } from "@readmepls/types";
  import type { Mode, ThemePref } from "$lib/theme/theme.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import type { RecordModel } from "pocketbase";
  import { ClientResponseError } from "pocketbase";
  import { goto, afterNavigate, invalidateAll } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { markRange, unmarkAll } from "$lib/highlight/render";
  import { deleteArticle } from "$lib/article/delete.js";
  import ChaptersSidebar from "$lib/components/ChaptersSidebar.svelte";
  import { buildTocFromDom } from "$lib/reader/toc.js";
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import TagEditor from "$lib/components/TagEditor.svelte";
  import Rail from "$lib/components/ui/Rail.svelte";
  import ArticleActions from "$lib/components/ArticleActions.svelte";
  import { ArrowUpRight } from "@lucide/svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import HighlightPopover from "$lib/components/HighlightPopover.svelte";
  import HighlightsSidebar from "$lib/components/HighlightsSidebar.svelte";
  import SourcePill from "$lib/components/ui/SourcePill.svelte";
  import { Button } from "$lib/components/ui/button";
  import { sourceView } from "$lib/source/source-view.js";
  import ReaderControlBar from "$lib/components/ReaderControlBar.svelte";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import { nextNavVisible } from "$lib/components/bottom-nav-scroll.js";
  import type { SheetKey } from "$lib/reader/control-bar.js";
  import ReaderHeader from "$lib/components/shell/ReaderHeader.svelte";
  import NavOverlay from "$lib/components/shell/NavOverlay.svelte";
  import { readerBackTarget } from "$lib/shell/back-target.js";
  import type { CollectionSummary } from "$lib/collections/types.js";

  // Global theme context provided by +layout.svelte. May be undefined when
  // the reader is rendered in isolation (e.g. unit tests without the layout).
  const themeCtx = getContext<
    { current: ThemePref; mode: Mode; set: (t: ThemePref) => void } | undefined
  >("theme");
  // The progress strip itself renders in +layout.svelte, outside .page --
  // .page's transform-keyframed animation makes it a stacking context, which
  // would cap the strip below TopBar no matter its z-index (see layout).
  const progressCtx = getContext<{ set: (p: number) => void } | undefined>(
    "readProgress",
  );

  const pb = browserPb();

  // Back returns to wherever the reader was entered from. Captured once:
  // hopping article-to-article keeps the original origin, not the last
  // article. A fresh deep link never navigates in, so it stays /library.
  let backHref = $state(readerBackTarget(null));
  let originCaptured = false;
  let navOpen = $state(false);
  afterNavigate(({ from }) => {
    // The page component is reused across /read/a -> /read/b; don't carry
    // an open overlay over to the next article.
    navOpen = false;
    if (originCaptured) return;
    originCaptured = true;
    backHref = readerBackTarget(from?.url ?? null);
  });
  const navCollections = $derived<CollectionSummary[]>(
    $page.data?.collections ?? [],
  );

  let article = $state<ArticleRecord | null>(null);
  let content = $state<RecordModel | null>(null);

  let progress = $state(0);
  // Last measurement taken while THIS page's DOM was known to be live. In an
  // SPA navigation, SvelteKit swaps the outgoing page's DOM for the
  // destination's before/while onDestroy fires, so re-measuring
  // document.body at teardown time can read the WRONG (often much shorter)
  // page and wrongly collapse to "finished". Every flush path reuses this
  // instead of re-querying the DOM.
  let pendingProgress = 0;

  // Highlight state
  // `let`, not `const`: reassigned by bind:this, not by Svelte reactivity.
  let bodyEl = $state<HTMLElement>(null!);
  let highlights = $state<Highlight[]>([]);
  let orphans = $state<string[]>([]);
  let popover = $state<{ x: number; y: number; range: Range } | null>(null);

  // Manual tag state — only manual-sourced tags are shown/edited here; AI tags remain read-only
  let manualTags = $state<{ id: string; name: string; linkId: string }[]>([]);

  // Collection state
  let collections = $state<{ id: string; name: string }[]>([]);

  let confirmingDelete = $state(false);
  // Shared inline error for reader actions (archive / delete).
  let actionError = $state("");

  // Chapters sidebar state
  let toc = $state<TocEntry[]>([]);
  let activeHeadingId = $state<string | null>(null);
  let tocObserver: IntersectionObserver | null = null;

  // Mobile control chrome: one sheet open at a time, and the control bar and
  // header hide on scroll-down, reveal on scroll-up (see bottom-nav-scroll.js).
  let activeSheet = $state<SheetKey | null>(null);
  let controlsVisible = $state(true);
  let prevScrollY = 0;
  let isDesktop = $state(false);
  let desktopMq: MediaQueryList | null = null;
  const hasChapters = $derived(toc.length > 0);
  function onDesktopChange(e: MediaQueryListEvent) {
    isDesktop = e.matches;
  }

  async function loadHighlights(articleId: string) {
    const raw = await pb.collection("highlights").getFullList({
      filter: pb.filter("article = {:id}", { id: articleId }),
      sort: "created",
    });
    highlights = raw.map((r) =>
      Highlight.parse({
        id: r.id,
        user: r.user,
        article: r.article,
        text: r.text,
        prefix: r.prefix ?? "",
        suffix: r.suffix ?? "",
        startOffset: r.start_offset ?? 0,
        endOffset: r.end_offset ?? 0,
        color: r.color,
        note: r.note ?? "",
        created: r.created,
      }),
    );
    await renderMarks();
  }

  async function loadTags(articleId: string) {
    const links = await pb.collection("article_tags").getFullList({
      filter: pb.filter("article = {:id} && source = {:src}", {
        id: articleId,
        src: "manual",
      }),
      expand: "tag",
    });
    manualTags = links.map((l) => ({
      id: l.expand!.tag.id,
      name: l.expand!.tag.name,
      linkId: l.id,
    }));
  }

  async function addTag(name: string) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    const slug = slugify(name);
    if (!slug) return;
    let tag: RecordModel;
    try {
      tag = await pb
        .collection("tags")
        .getFirstListItem(pb.filter("slug = {:slug}", { slug }));
    } catch (e) {
      if (!(e instanceof ClientResponseError && e.status === 404)) throw e;
      tag = await pb.collection("tags").create({ user: uid, name, slug });
    }
    await pb.collection("article_tags").create({
      article: $page.params.id,
      tag: tag.id,
      source: "manual",
      confidence: 1,
    });
    await loadTags($page.params.id!);
  }

  async function removeTag(tagId: string) {
    const link = manualTags.find((t) => t.id === tagId);
    if (link) {
      await pb.collection("article_tags").delete(link.linkId);
      await loadTags($page.params.id!);
    }
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
    if (!sel || sel.isCollapsed || !bodyEl.contains(sel.anchorNode)) {
      popover = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popover = {
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 4,
      range,
    };
  }

  async function createHighlight(color: HighlightColor, note: string) {
    if (!popover) return;
    try {
      const sel = await anchoring.describe(rangeOver(bodyEl), popover.range);
      await pb.collection("highlights").create({
        user: pb.authStore.model?.id,
        article: $page.params.id,
        text: sel.text,
        prefix: sel.prefix,
        suffix: sel.suffix,
        start_offset: sel.startOffset,
        end_offset: sel.endOffset,
        color,
        note,
      });
      popover = null;
      window.getSelection()?.removeAllRanges();
      await loadHighlights($page.params.id!);
    } catch {
      popover = null; // bad selection — silently abort (see spec §10)
    }
  }

  function jumpTo(id: string) {
    bodyEl
      .querySelector(`mark[data-hl-id="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteHighlight(id: string) {
    await pb.collection("highlights").delete(id);
    await loadHighlights($page.params.id!);
  }

  // The live global theme context keeps the article in sync with the chrome;
  // light is the fallback when the reader renders in isolation.
  const activeTheme = $derived<Mode>(themeCtx ? themeCtx.mode : "light");
  const source = $derived(sourceView(pb, content));
  const originalUrl = $derived(
    article?.url ? httpUrlOrNull(article.url) : null,
  );

  // Push every local progress change up to the layout-rendered strip.
  $effect(() => {
    progressCtx?.set(progress);
  });

  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  // max<=0 means the content fits the viewport with no scrollbar — treat
  // that as fully read rather than 0, since scroll position can't express it.
  function computeProgress(): number {
    const max = document.body.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
  }

  function onScroll() {
    const curY = window.scrollY;
    controlsVisible = nextNavVisible(prevScrollY, curY, controlsVisible);
    prevScrollY = curY;

    // Measure now, while this page's DOM is definitely still the live one —
    // not inside the debounced callback, which may run (or be pre-empted by
    // flushSave) after navigation has already started swapping the DOM.
    pendingProgress = computeProgress();
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      progress = pendingProgress;
      if (article)
        pb.collection("articles").update(article.id, {
          progress: pendingProgress,
        });
    }, 400);
  }

  // Writes the last known-good measurement immediately, bypassing the
  // debounce — used when the component is about to disappear (navigation,
  // tab close/hide) and a pending debounced write would otherwise be lost.
  function flushSave() {
    clearTimeout(progressTimer);
    progress = pendingProgress;
    if (article)
      pb.collection("articles").update(article.id, {
        progress: pendingProgress,
      });
  }

  function onVisibilityChange() {
    if (document.hidden) flushSave();
  }

  // Runs once on load, after content is in the DOM: restores scroll position
  // for an in-progress article, or — if the content fits the viewport with
  // no scrollbar — marks it finished immediately (no scroll event will ever
  // fire to do this later).
  function resolveInitialScroll() {
    const max = document.body.scrollHeight - window.innerHeight;
    if (max <= 0) {
      pendingProgress = 1;
      flushSave();
      return;
    }
    if (progress > STARTED_THRESHOLD && progress < FINISHED_THRESHOLD) {
      window.scrollTo(0, progress * max);
    }
  }

  // Prefer the worker-emitted toc (validated); fall back to parsing the DOM.
  function resolveToc() {
    const parsed = TocEntry.array().safeParse(content?.toc);
    toc =
      parsed.success && parsed.data.length
        ? parsed.data
        : buildTocFromDom(bodyEl);
  }

  function observeHeadings() {
    const headings = bodyEl.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
    if (headings.length === 0) return;
    tocObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting && e.target.id) activeHeadingId = e.target.id;
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => tocObserver!.observe(h));
  }

  function jumpToHeading(id: string) {
    bodyEl
      .querySelector(`#${CSS.escape(id)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    activeSheet = null;
  }

  onMount(async () => {
    // Set up before the article fetch (not after) so isDesktop is correct
    // from the very first paint, including during the loading skeleton.
    desktopMq = window.matchMedia("(min-width: 1024px)");
    isDesktop = desktopMq.matches;
    desktopMq.addEventListener("change", onDesktopChange);

    const id = $page.params.id;
    if (!id) return;
    article = await pb
      .collection("articles")
      .getOne(id, { expand: "content.source" });
    // article is always non-null here — getOne throws on not-found
    content = article!.expand?.content ?? null;
    progress = article!.progress ?? 0;
    pendingProgress = progress;

    if (article!.status === "unread") {
      await pb
        .collection("articles")
        .update(article!.id, { status: "reading" });
    }
    // Load highlights and manual tags after article HTML is in the DOM (next tick).
    await tick();
    resolveInitialScroll();
    resolveToc();
    observeHeadings();
    // Attach before the remaining loads (not after) so a scroll during those
    // network calls is never silently dropped.
    prevScrollY = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    await loadHighlights(id);
    await loadTags(id);
    await loadCollections();
  });

  // An async onMount can't register a cleanup; tear down listeners here and
  // flush any pending debounced save so navigating away doesn't lose it.
  onDestroy(() => {
    progressCtx?.set(0);
    tocObserver?.disconnect();
    desktopMq?.removeEventListener("change", onDesktopChange);
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    flushSave();
  });

  async function archive() {
    if (!article) return;
    actionError = "";
    try {
      await pb
        .collection("articles")
        .update(article.id, { status: "archived" });
      // invalidateAll: the shell's collection counts come from the root
      // layout load, which only re-runs when told to.
      await goto(resolve("/library"), { invalidateAll: true });
    } catch {
      actionError = "couldn't archive that. try again.";
    }
  }

  async function loadCollections() {
    // Use pb.filter binding to prevent injection
    collections = (
      await pb.collection("collections").getFullList({ sort: "name" })
    ).map((c) => ({ id: c.id, name: c.name as string }));
  }

  async function addToCollection(collectionId: string) {
    await pb.collection("collection_items").create({
      collection: collectionId,
      article: $page.params.id,
      order: 0,
    });
    // Refresh the shell's collection counts (root layout load).
    await invalidateAll();
  }

  async function confirmDelete() {
    if (!article) return;
    confirmingDelete = false;
    actionError = "";
    try {
      await deleteArticle(pb, article.id);
      // Clear the reference so onDestroy's flushSave (which fires on teardown
      // after this navigation) doesn't write progress to a now-deleted record.
      article = null;
      await goto(resolve("/library"), { invalidateAll: true });
    } catch {
      actionError = "couldn't delete that. try again.";
    }
  }
</script>

<ReaderHeader
  {backHref}
  hidden={!controlsVisible}
  onMenu={() => (navOpen = true)}
/>

<NavOverlay
  open={navOpen}
  onClose={() => (navOpen = false)}
  pathname={$page.url.pathname}
  collections={navCollections}
/>

<div class="reader-shell">
  {#if actionError}
    <p class="delete-error" role="alert">{actionError}</p>
  {/if}

  {#if !content}
    <div class="flex flex-col gap-2" aria-hidden="true">
      {#each Array(8) as _, i (i)}
        <Skeleton class="h-4" />
      {/each}
    </div>
  {:else}
    <div class="reader-layout">
      {#if isDesktop}
        <Rail label="reading tools">
          {#if toc.length}
            <section class="rail-chapters">
              <h2 class="rail-heading">chapters</h2>
              <ChaptersSidebar
                {toc}
                activeId={activeHeadingId}
                onjump={jumpToHeading}
              />
            </section>
          {/if}
          <TagEditor
            tags={manualTags.map((t) => ({ id: t.id, name: t.name }))}
            onadd={addTag}
            onremove={removeTag}
          />
          <ArticleActions
            {collections}
            onAddToCollection={addToCollection}
            onArchive={archive}
            onDelete={() => (confirmingDelete = true)}
          />
        </Rail>
      {/if}

      <div class="reader-main">
        <!-- data-theme uses the live global context so TopBar changes retone the article (FIX 1) -->
        <!-- Svelte emits an a11y warning for onmouseup on a non-interactive <article>; accepted for text-selection in the reader. -->
        <article
          data-theme={activeTheme}
          class="reader prose-reader"
          onmouseup={onMouseUp}
        >
          <h1>{content.title}</h1>
          {#if source || originalUrl}
            <div class="reader-source">
              {#if source}<SourcePill
                  name={source.name}
                  host={source.host}
                  iconUrl={source.iconUrl}
                />{/if}
              {#if source && originalUrl}<span class="dot" aria-hidden="true"
                  >·</span
                >{/if}
              {#if originalUrl}
                <Button
                  variant="link"
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="open-original"
                >
                  open original <ArrowUpRight
                    class="icon-sm"
                    aria-hidden="true"
                  />
                </Button>
              {/if}
            </div>
          {/if}
          <!-- content_html is sanitized in the worker (Task 2) before storage -->
          <!-- bind:this anchors the highlight anchoring scope to the article body -->
          <div bind:this={bodyEl}>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- worker-sanitized above; rendering article HTML is the reader's whole purpose -->
            {@html content.content_html}
          </div>
        </article>
      </div>

      {#if isDesktop}
        <HighlightsSidebar
          {highlights}
          {orphans}
          onjump={jumpTo}
          ondelete={deleteHighlight}
        />
      {/if}
    </div>
  {/if}
</div>

{#if popover}
  <HighlightPopover
    x={popover.x}
    y={popover.y}
    onpick={createHighlight}
    oncancel={() => (popover = null)}
  />
{/if}

<ConfirmAction
  open={confirmingDelete}
  title="delete this article?"
  confirmLabel="delete"
  cancelLabel="cancel"
  message="this can't be undone."
  onConfirm={confirmDelete}
  onCancel={() => (confirmingDelete = false)}
/>

{#if content && !isDesktop}
  <ReaderControlBar
    {hasChapters}
    hidden={!controlsVisible}
    active={activeSheet}
    onOpen={(s) => (activeSheet = s)}
  />

  {#if hasChapters}
    <BottomSheet
      open={activeSheet === "chapters"}
      onClose={() => (activeSheet = null)}
      title="Chapters"
    >
      <ChaptersSidebar
        {toc}
        activeId={activeHeadingId}
        onjump={jumpToHeading}
      />
    </BottomSheet>
  {/if}

  <BottomSheet
    open={activeSheet === "highlights"}
    onClose={() => (activeSheet = null)}
    title="Highlights"
  >
    <HighlightsSidebar
      {highlights}
      {orphans}
      onjump={(id) => {
        jumpTo(id);
        activeSheet = null;
      }}
      ondelete={deleteHighlight}
    />
  </BottomSheet>

  <BottomSheet
    open={activeSheet === "more"}
    onClose={() => (activeSheet = null)}
    title="More"
  >
    <TagEditor
      tags={manualTags.map((t) => ({ id: t.id, name: t.name }))}
      onadd={addTag}
      onremove={removeTag}
    />
    <ArticleActions
      {collections}
      onAddToCollection={addToCollection}
      onArchive={archive}
      onDelete={() => (confirmingDelete = true)}
    />
  </BottomSheet>
{/if}

<style>
  /* The shell is wider than the prose measure so the highlights rail has room. */
  .reader-shell {
    max-width: var(--width-prose);
    margin: 0 auto;
  }
  .rail-heading {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-2);
  }

  /* The article's box only; reading.css (.prose-reader) owns the type. */
  .reader {
    background: var(--reading-bg);
    /* calc accounts for padding so content width = measure exactly (box-sizing: border-box from Task 1) */
    max-width: calc(var(--reading-measure) + 2 * 1.5rem);
    margin: 0 auto;
    padding: 1.5rem;
    border-radius: var(--radius-lg);
  }

  /* single-column by default: rail (controls+actions) above article, highlights below */
  .reader-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);
  }
  @media (min-width: 1024px) {
    .reader-shell {
      max-width: var(--width-reader);
    }
    .reader-layout {
      grid-template-columns: 14rem minmax(0, 1fr) 16rem;
      align-items: start;
    }
    /* Same pinning contract as the rail (see Rail.svelte): clear the sticky
       TopBar, and scroll internally once the highlight list outgrows the
       viewport instead of trailing off the bottom of it. */
    .reader-layout :global(.hl-sidebar) {
      position: sticky;
      top: calc(var(--topbar-h) + var(--space-4));
      max-height: calc(100dvh - var(--topbar-h) - 2 * var(--space-4));
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
  /* Phone: run the article edge-to-edge. It sits inside .page's 1.25rem
     inset (= --reading-gutter on phone); pulling it out by the gutter lets
     reading.css bleed pre/table/figure/math exactly to the screen edge. */
  @media (max-width: 39.99rem) {
    .reader {
      margin-inline: calc(-1 * var(--reading-gutter));
      padding: var(--space-4) var(--reading-gutter);
      border-radius: 0;
    }
  }
  .delete-error {
    margin: 0 0 0.75rem;
    font-size: var(--text-sm);
    color: var(--color-accent);
  }
  .reader-source {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin: 0 0 var(--space-4);
  }
  .reader-source .dot {
    color: var(--color-text-muted);
  }
  .reader-source :global(.open-original) {
    /* chrome, not prose: opt out of the reading link stroke */
    background: none;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    height: auto;
    padding: 0;
    gap: var(--space-1);
  }

  /* Keep the last lines of prose clear of the fixed control bar on mobile. */
  @media (max-width: 1023.98px) {
    .reader-shell {
      padding-bottom: 72px;
    }
  }
</style>
