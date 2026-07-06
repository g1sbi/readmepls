<script lang="ts">
  import { onMount, onDestroy, getContext, tick } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { withReaderDefaults, anchoring, rangeOver, slugify, STARTED_THRESHOLD, FINISHED_THRESHOLD } from "@readmepls/core";
  import { Highlight, type ReaderPrefs, type HighlightColor } from "@readmepls/types";
  import type { Theme } from "$lib/theme/theme.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import type { RecordModel } from "pocketbase";
  import { ClientResponseError } from "pocketbase";
  import { goto } from "$app/navigation";
  import { readerCssVars } from "$lib/reader/css-vars.js";
  import { markRange, unmarkAll } from "$lib/highlight/render";
  import { deleteArticle } from "$lib/article/delete.js";
  import ReaderControls from "$lib/components/ReaderControls.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import TagEditor from "$lib/components/TagEditor.svelte";
  import Rail from "$lib/components/ui/Rail.svelte";
  import DropdownMenu from "$lib/components/ui/DropdownMenu.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
  import { ArrowLeft, Archive, Trash2, FolderPlus } from "@lucide/svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import HighlightPopover from "$lib/components/HighlightPopover.svelte";
  import HighlightsSidebar from "$lib/components/HighlightsSidebar.svelte";
  import SourcePill from "$lib/components/ui/SourcePill.svelte";
  import { sourceView } from "$lib/source/source-view.js";

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

  // Manual tag state — only manual-sourced tags are shown/edited here; AI tags remain read-only
  let manualTags = $state<{ id: string; name: string; linkId: string }[]>([]);

  // Collection state
  let collections = $state<{ id: string; name: string }[]>([]);

  let confirmingDelete = $state(false);
  // Shared inline error for reader actions (archive / delete).
  let actionError = $state("");

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

  async function loadTags(articleId: string) {
    const links = await pb.collection("article_tags").getFullList({
      filter: pb.filter('article = {:id} && source = {:src}', { id: articleId, src: "manual" }),
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
      tag = await pb.collection("tags").getFirstListItem(
        pb.filter('slug = {:slug}', { slug }),
      );
    } catch (e) {
      if (!(e instanceof ClientResponseError && e.status === 404)) throw e;
      tag = await pb.collection("tags").create({ user: uid, name, slug });
    }
    await pb.collection("article_tags").create({
      article: $page.params.id, tag: tag.id, source: "manual", confidence: 1,
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
  const source = $derived(sourceView(pb, content));

  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  // max<=0 means the content fits the viewport with no scrollbar — treat
  // that as fully read rather than 0, since scroll position can't express it.
  function computeProgress(): number {
    const max = document.body.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
  }

  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      progress = computeProgress();
      if (article) pb.collection("articles").update(article.id, { progress });
    }, 400);
  }

  // Writes the current progress immediately, bypassing the debounce — used
  // when the component is about to disappear (navigation, tab close/hide)
  // and a pending debounced write would otherwise be lost.
  function flushSave() {
    clearTimeout(progressTimer);
    progress = computeProgress();
    if (article) pb.collection("articles").update(article.id, { progress });
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
      flushSave();
      return;
    }
    if (progress > STARTED_THRESHOLD && progress < FINISHED_THRESHOLD) {
      window.scrollTo(0, progress * max);
    }
  }

  onMount(async () => {
    const id = $page.params.id;
    if (!id) return;
    article = await pb.collection("articles").getOne(id, { expand: "content.source" });
    // article is always non-null here — getOne throws on not-found
    content = article!.expand?.content ?? null;
    progress = article!.progress ?? 0;

    const uid = pb.authStore.model?.id;
    if (uid) {
      const me = await pb.collection("users").getOne(uid);
      prefs = withReaderDefaults(me.reader_prefs ?? undefined);
    }
    if (article!.status === "unread") {
      await pb.collection("articles").update(article!.id, { status: "reading" });
    }
    // Load highlights and manual tags after article HTML is in the DOM (next tick).
    await tick();
    resolveInitialScroll();
    await loadHighlights(id);
    await loadTags(id);
    await loadCollections();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  // An async onMount can't register a cleanup; tear down listeners here and
  // flush any pending debounced save so navigating away doesn't lose it.
  onDestroy(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    flushSave();
  });

  async function archive() {
    if (!article) return;
    actionError = "";
    try {
      await pb.collection("articles").update(article.id, { status: "archived" });
      await goto("/library");
    } catch {
      actionError = "couldn't archive that. try again.";
    }
  }

  async function loadCollections() {
    // Use pb.filter binding to prevent injection
    collections = (await pb.collection("collections").getFullList({ sort: "name" }))
      .map((c) => ({ id: c.id, name: c.name as string }));
  }

  async function addToCollection(collectionId: string) {
    await pb.collection("collection_items").create({
      collection: collectionId, article: $page.params.id, order: 0,
    });
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
      await goto("/library");
    } catch {
      actionError = "couldn't delete that. try again.";
    }
  }
</script>

<div class="progress" style="--p: {progress}" aria-hidden="true"></div>
<!-- reader vars live on the shell so the width pref governs the shell, not just the article -->
<div class="reader-shell" style={readerCssVars(prefs)}>
  <div class="bar">
    <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
  </div>

  {#if actionError}
    <p class="delete-error" role="alert">{actionError}</p>
  {/if}

  {#if !content}
    <Skeleton lines={8} />
  {:else}
    <div class="reader-layout">
      <Rail label="reading tools">
        <ReaderControls {prefs} onChange={savePrefs} />
        <TagEditor tags={manualTags.map(t => ({ id: t.id, name: t.name }))} onadd={addTag} onremove={removeTag} />
        <div class="article-actions" role="group" aria-label="article actions">
          <DropdownMenu label="add to collection" align="start">
            {#snippet trigger()}<FolderPlus class="icon-md" aria-hidden="true" />{/snippet}
            {#snippet children()}
              <div class="menu-label">add to collection</div>
              {#if collections.length > 0}
                {#each collections as c (c.id)}
                  <MenuItem onSelect={() => addToCollection(c.id)}>{c.name}</MenuItem>
                {/each}
              {:else}
                <div class="menu-empty">no collections yet</div>
              {/if}
            {/snippet}
          </DropdownMenu>
          <button class="action-icon" onclick={archive} aria-label="archive article"><Archive class="icon-md" aria-hidden="true" /></button>
          <button class="action-icon" onclick={() => (confirmingDelete = true)} aria-label="delete article"><Trash2 class="icon-md" aria-hidden="true" /></button>
        </div>
      </Rail>

      <div class="reader-main">
        <!-- data-theme uses the live global context so TopBar changes retone the article (FIX 1) -->
        <!-- Svelte emits an a11y warning for onmouseup on a non-interactive <article>; accepted for text-selection in the reader. -->
        <article data-theme={activeTheme} class="reader" onmouseup={onMouseUp}>
          <h1>{content.title}</h1>
          {#if source}
            <div class="reader-source"><SourcePill name={source.name} host={source.host} iconUrl={source.iconUrl} /></div>
          {/if}
          <!-- content_html is sanitized in the worker (Task 2) before storage -->
          <!-- bind:this anchors the highlight anchoring scope to the article body -->
          <div bind:this={bodyEl}>
            {@html content.content_html}
          </div>
        </article>
      </div>

      <HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
    </div>
  {/if}
</div>

{#if popover}
  <HighlightPopover x={popover.x} y={popover.y} onpick={createHighlight} oncancel={() => (popover = null)} />
{/if}

<ConfirmDialog
  open={confirmingDelete}
  title="delete this article?"
  message="this can't be undone."
  onConfirm={confirmDelete}
  onCancel={() => (confirmingDelete = false)}
/>

<style>
  .progress { position: fixed; top: 0; left: 0; height: 3px; width: calc(var(--p) * 100%); background: var(--color-accent); z-index: 10; transition: width var(--dur-fast) var(--ease-out); }
  /* --reading-measure is set inline on .reader-shell so the column width
     follows the pref (narrow/normal/wide) end-to-end (FIX 2).
     The shell is wider than the prose measure so the highlights rail has room. */
  .reader-shell { max-width: var(--width-prose); margin: 0 auto; }
  .bar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
  .bar .back { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); color: var(--color-text-muted); text-decoration: none; }
  .bar .back:hover { color: var(--color-text); }

  .article-actions { display: flex; gap: var(--space-2); }
  .article-actions :global(.dropdown__trigger),
  .action-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2.25rem; height: 2.25rem; padding: 0;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  .article-actions :global(.dropdown__trigger):hover,
  .action-icon:hover { color: var(--color-accent); box-shadow: var(--shadow-sm); }
  .article-actions :global(.dropdown__trigger):focus-visible,
  .action-icon:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) {
    .article-actions :global(.dropdown__trigger), .action-icon { transition: none; }
  }

  .reader {
    background: var(--reading-bg); color: var(--reading-text);
    font-family: var(--reading-font); font-size: var(--reading-size);
    line-height: var(--reading-leading);
    /* calc accounts for padding so content width = measure exactly (box-sizing: border-box from Task 1) */
    max-width: calc(var(--reading-measure) + 2 * 1.5rem);
    margin: 0 auto; padding: 1.5rem; border-radius: var(--radius-lg);
  }
  .reader :global(h1) { font-family: var(--font-reading); line-height: 1.15; }
  .reader :global(a) { color: var(--color-accent); }
  .reader :global(pre), .reader :global(code) { font-family: var(--font-mono); }
  .reader :global(pre) { background: var(--color-surface-sunken); padding: 1rem; border-radius: var(--radius-md); overflow-x: auto; }
  .reader :global(blockquote) { border-left: 3px solid var(--color-accent); margin: 1rem 0; padding-left: 1rem; color: var(--color-text-muted); }
  .reader :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-md); }

  /* single-column by default: rail (controls+actions) above article, highlights below */
  .reader-layout { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  @media (min-width: 1024px) {
    .reader-shell { max-width: var(--width-page); }
    .reader-layout { grid-template-columns: 14rem minmax(0, 1fr) 16rem; align-items: start; }
    .reader-layout :global(.hl-sidebar) { position: sticky; top: var(--space-4); }
  }
  @media (prefers-reduced-motion: reduce) { .progress { transition: none; } }
  .delete-error { margin: 0 0 0.75rem; font-size: var(--text-sm); color: var(--color-accent); }
  .reader-source { margin: 0 0 var(--space-4); }
</style>
