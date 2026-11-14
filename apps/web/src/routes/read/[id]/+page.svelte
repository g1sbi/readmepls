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
  import ChapterList from "$lib/components/ChapterList.svelte";
  import ChapterTicks from "$lib/components/reader/ChapterTicks.svelte";
  import { buildTocFromDom } from "$lib/reader/toc.js";
  import { activeHeadingId as headingInView } from "$lib/reader/scroll-spy.js";
  import {
    mapPositions,
    measureMarks,
    type MapPosition,
  } from "$lib/reader/highlight-map.js";
  import { MediaQuery } from "svelte/reactivity";
  import { DESKTOP_QUERY } from "$lib/shell/nav.js";
  import ConfirmAction from "$lib/components/ConfirmAction.svelte";
  import ReaderActionsMenu from "$lib/components/reader/ReaderActionsMenu.svelte";
  import ReaderMoreSheet from "$lib/components/reader/ReaderMoreSheet.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import HighlightPopover from "$lib/components/reader/HighlightPopover.svelte";
  import HighlightTray from "$lib/components/reader/HighlightTray.svelte";
  import HighlightList from "$lib/components/reader/HighlightList.svelte";
  import HighlightsPanel from "$lib/components/reader/HighlightsPanel.svelte";
  import HighlightMap from "$lib/components/reader/HighlightMap.svelte";
  import ArticleMeta from "$lib/components/reader/ArticleMeta.svelte";
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
  // The passage waiting for a color: the desktop popover anchors to x/y, the
  // phone tray just needs the range.
  let pending = $state<{ x: number; y: number; range: Range } | null>(null);
  // Marks whose band should draw itself in (a just-saved highlight).
  let drawingId = $state<string | null>(null);

  // Manual tag state — only manual-sourced tags are shown/edited here; AI tags remain read-only
  let manualTags = $state<{ id: string; name: string; linkId: string }[]>([]);

  let confirmingDelete = $state(false);
  // Shared inline error for reader actions (archive / delete).
  let actionError = $state("");

  // Chapters sidebar state
  let toc = $state<TocEntry[]>([]);
  let activeHeadingId = $state<string | null>(null);
  let spyFrame: number | null = null;

  // Mobile control chrome: one sheet open at a time, and the control bar and
  // header hide on scroll-down, reveal on scroll-up (see bottom-nav-scroll.js).
  let activeSheet = $state<SheetKey | null>(null);
  let controlsVisible = $state(true);
  let prevScrollY = 0;
  // The focused desktop layout (edge chapters, highlight map, side panel)
  // starts at lg; below it the phone bar and its sheets do the same jobs.
  const desktop = new MediaQuery(DESKTOP_QUERY);
  const isDesktop = $derived(desktop.current);
  const hasChapters = $derived(toc.length > 0);

  // Focused-desktop chrome.
  let panelOpen = $state(false);
  let titleEl = $state<HTMLElement | null>(null);
  // The header carries the article title once the h1 has scrolled away.
  let showTitle = $state(false);
  let positions = $state<MapPosition[]>([]);
  let viewport = $state({ at: 0, size: 1 });

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
    measureMap();
  }

  // The map is measured, not derived: only the rendered marks know where a
  // highlight ended up. Re-run on load, on resize and whenever marks change.
  function measureMap() {
    if (!bodyEl) return;
    positions = mapPositions(measureMarks(bodyEl), document.body.scrollHeight);
    updateViewport();
  }

  function updateViewport() {
    const docH = document.body.scrollHeight;
    if (docH <= 0) return;
    viewport = {
      at: Math.min(1, Math.max(0, window.scrollY / docH)),
      size: Math.min(1, window.innerHeight / docH),
    };
  }

  // Touch selections never fire mouseup, so the reader also watches
  // selectionchange — debounced, since dragging a handle fires it per pixel.
  const SELECTION_DEBOUNCE = 120;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;

  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyEl?.contains(sel.anchorNode)) {
      pending = null;
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    pending = {
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 4,
      range,
    };
  }

  function onSelectionChange() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(readSelection, SELECTION_DEBOUNCE);
  }

  async function createHighlight(color: HighlightColor, note: string) {
    if (!pending) return;
    try {
      const sel = await anchoring.describe(rangeOver(bodyEl), pending.range);
      const created = await pb.collection("highlights").create({
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
      pending = null;
      window.getSelection()?.removeAllRanges();
      await loadHighlights($page.params.id!);
      // The band (and, on desktop, its map tick) draws itself in once.
      drawMark(created.id as string);
    } catch {
      pending = null; // bad selection — silently abort (see spec §10)
    }
  }

  function drawMark(id: string) {
    drawingId = id;
    for (const m of bodyEl.querySelectorAll<HTMLElement>(
      `mark[data-hl-id="${id}"]`,
    ))
      m.dataset.hlNew = "";
    setTimeout(() => {
      for (const m of bodyEl.querySelectorAll<HTMLElement>(
        `mark[data-hl-id="${id}"]`,
      ))
        delete m.dataset.hlNew;
      drawingId = null;
    }, DRAW_MS);
  }

  const FLASH_MS = 1200;
  // Long enough for the band to finish drawing (--dur-marker) plus the map
  // tick's 400ms lag behind it.
  const DRAW_MS = 1200;

  function jumpTo(id: string) {
    const mark = bodyEl.querySelector<HTMLElement>(`mark[data-hl-id="${id}"]`);
    if (!mark) return;
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    // reading.css redraws the band while the attribute is set.
    mark.dataset.hlFlash = "";
    setTimeout(() => delete mark.dataset.hlFlash, FLASH_MS);
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
    scheduleHeadingSpy();
    updateViewport();
    // The h1's bottom leaving the top of the screen hands the title to the
    // header, as the renders show.
    showTitle = (titleEl?.getBoundingClientRect().bottom ?? 1) < 0;
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

  // Measured per frame rather than observed: an IntersectionObserver can't
  // express "the last chapter is current once the page bottoms out", which is
  // how a short final chapter becomes current at all.
  function updateActiveHeading() {
    if (!bodyEl) return;
    const headings = [
      ...bodyEl.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"),
    ]
      .filter((h) => h.id)
      .map((h) => ({ id: h.id, top: h.getBoundingClientRect().top }));
    const atBottom =
      window.scrollY + window.innerHeight >= document.body.scrollHeight - 2;
    activeHeadingId = headingInView(headings, window.innerHeight, atBottom);
  }

  function scheduleHeadingSpy() {
    if (spyFrame !== null) return;
    spyFrame = requestAnimationFrame(() => {
      spyFrame = null;
      updateActiveHeading();
    });
  }

  function jumpToHeading(id: string) {
    bodyEl
      .querySelector(`#${CSS.escape(id)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    activeSheet = null;
  }

  onMount(async () => {
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
    updateActiveHeading();
    // Attach before the remaining loads (not after) so a scroll during those
    // network calls is never silently dropped.
    prevScrollY = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measureMap, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    await loadHighlights(id);
    await loadTags(id);
  });

  // An async onMount can't register a cleanup; tear down listeners here and
  // flush any pending debounced save so navigating away doesn't lose it.
  onDestroy(() => {
    progressCtx?.set(0);
    if (spyFrame !== null) cancelAnimationFrame(spyFrame);
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", measureMap);
    document.removeEventListener("selectionchange", onSelectionChange);
    clearTimeout(selectionTimer);
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
  title={content?.title as string | undefined}
  {showTitle}
  highlightsCount={highlights.length}
  onHighlights={content ? () => (panelOpen = !panelOpen) : undefined}
  actions={content ? readerActions : undefined}
/>

{#snippet readerActions()}
  <ReaderActionsMenu
    collections={navCollections}
    {originalUrl}
    onAddToCollection={addToCollection}
    onArchive={archive}
    onDelete={() => (confirmingDelete = true)}
  />
{/snippet}

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
    {#if isDesktop}
      <ChapterTicks {toc} activeId={activeHeadingId} onjump={jumpToHeading} />
      <HighlightMap
        {highlights}
        {positions}
        {viewport}
        newId={drawingId}
        onjump={jumpTo}
      />
      <HighlightsPanel
        open={panelOpen}
        onClose={() => (panelOpen = false)}
        {highlights}
        {orphans}
        onjump={jumpTo}
        ondelete={deleteHighlight}
      />
    {/if}

    <!-- data-theme uses the live global context so a theme change retones
         the article; the edges fade out while the panel is open. -->
    <!-- Svelte emits an a11y warning for onmouseup on a non-interactive <article>; accepted for text-selection in the reader. -->
    <article
      data-theme={activeTheme}
      class="reader prose-reader"
      data-shifted={isDesktop && panelOpen}
      onmouseup={readSelection}
    >
      <h1 bind:this={titleEl}>{content.title}</h1>
      <ArticleMeta
        {source}
        {originalUrl}
        readTime={(content.read_time as number | undefined) ?? null}
        created={(article?.created as string | undefined) ?? ""}
        tags={manualTags.map((t) => ({ id: t.id, name: t.name }))}
        onAddTag={addTag}
        onRemoveTag={removeTag}
      />
      <!-- content_html is sanitized in the worker (Task 2) before storage -->
      <!-- bind:this anchors the highlight anchoring scope to the article body -->
      <div bind:this={bodyEl}>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- worker-sanitized above; rendering article HTML is the reader's whole purpose -->
        {@html content.content_html}
      </div>
    </article>
  {/if}
</div>

{#if pending && isDesktop}
  <HighlightPopover
    x={pending.x}
    y={pending.y}
    onpick={createHighlight}
    oncancel={() => (pending = null)}
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
  {#if pending}
    <HighlightTray
      onpick={createHighlight}
      oncancel={() => {
        pending = null;
        window.getSelection()?.removeAllRanges();
      }}
    />
  {:else}
    <ReaderControlBar
      {hasChapters}
      hidden={!controlsVisible}
      active={activeSheet}
      onOpen={(s) => (activeSheet = s)}
    />
  {/if}

  {#if hasChapters}
    <BottomSheet
      open={activeSheet === "chapters"}
      onClose={() => (activeSheet = null)}
      title="Chapters"
    >
      <nav class="phone-chapters" aria-label="chapters">
        <ChapterList
          items={toc}
          activeId={activeHeadingId}
          onjump={jumpToHeading}
        />
      </nav>
    </BottomSheet>
  {/if}

  <BottomSheet
    open={activeSheet === "highlights"}
    onClose={() => (activeSheet = null)}
    title="Highlights"
  >
    <HighlightList
      {highlights}
      {orphans}
      onjump={(id) => {
        jumpTo(id);
        activeSheet = null;
      }}
      ondelete={deleteHighlight}
    />
  </BottomSheet>

  <ReaderMoreSheet
    open={activeSheet === "more"}
    onClose={() => (activeSheet = null)}
    collections={navCollections}
    {originalUrl}
    tags={manualTags.map((t) => ({ id: t.id, name: t.name }))}
    onAddTag={addTag}
    onRemoveTag={removeTag}
    onAddToCollection={addToCollection}
    onArchive={archive}
    onDelete={() => (confirmingDelete = true)}
  />
{/if}

<style>
  /* The shell is the reading measure itself now: the chapter ticks and the
     highlight map are fixed to the viewport edges, not columns in a grid. */
  .reader-shell {
    max-width: var(--width-prose);
    margin: 0 auto;
  }

  /* The article's box only; reading.css (.prose-reader) owns the type. */
  .reader {
    background: var(--reading-bg);
    /* calc accounts for padding so content width = measure exactly (box-sizing: border-box from Task 1) */
    max-width: calc(var(--reading-measure) + 2 * 1.5rem);
    margin: 0 auto;
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    transition: transform var(--dur-slow) var(--ease-out);
  }
  /* The panel takes the right edge, so the article steps left to stay whole. */
  .reader[data-shifted="true"] {
    transform: translateX(-170px);
  }
  @media (prefers-reduced-motion: reduce) {
    .reader {
      transition: none;
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
  .phone-chapters {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }
  .phone-chapters :global(ul) {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .phone-chapters :global(ul ul) {
    margin-left: var(--space-3);
  }
  .delete-error {
    margin: 0 0 0.75rem;
    font-size: var(--text-sm);
    color: var(--color-accent);
  }

  /* Keep the last lines of prose clear of the fixed control bar on mobile. */
  @media (max-width: 63.99rem) {
    .reader-shell {
      padding-bottom: 72px;
    }
  }
</style>
