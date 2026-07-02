<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import SourcePill from "./ui/SourcePill.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import DropdownMenu from "./ui/DropdownMenu.svelte";
  import MenuItem from "./ui/MenuItem.svelte";
  import { RotateCw, Trash2, MoreHorizontal, Archive, ArchiveRestore, FolderPlus } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";
  import { sourceView } from "$lib/source/source-view.js";
  import { browserPb } from "$lib/pb.js";
  import { page } from "$app/stores";

  let {
    article,
    onRetry,
    onDelete,
    collections,
    onAddToCollection,
    onArchive,
    onUnarchive,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; status?: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
    collections?: { id: string; name: string }[];
    onAddToCollection?: (articleId: string, collectionId: string) => void;
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
  } = $props();

  let confirming = $state(false);

  const pb = browserPb();
  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  const source = $derived(sourceView(pb, content));
  // AI tags are a Pro feature — a standard-tier viewer never sees them, even if
  // this shared content row has them (a pro-tier user may have captured the URL
  // first). See docs/superpowers/specs/2026-07-02-phase-8-tiering-entitlements-design.md §3.
  const isPro = $derived($page.data.tier === "pro");
  const tags = $derived<string[]>(isPro ? (content?.ai_tags_json ?? []) : []);
  const isArchived = $derived(article.status === "archived");
  const hasMenu = $derived(!!(onAddToCollection || onArchive || onUnarchive || onDelete));

  // Show a clean hostname while processing; fall back to the raw URL if it
  // can't be parsed (e.g. malformed input mid-capture).
  function hostOf(u: string): string {
    try { return new URL(u).hostname; } catch { return u; }
  }
</script>

<Card>
  {#if state === "processing"}
    <Spinner label="Processing" />
    <span class="url">{hostOf(article.url)}</span>
  {:else if state === "failed" || state === "partial"}
    <h3>{content?.title ?? article.url}</h3>
    <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
    <Button variant="accent" onclick={() => onRetry?.(article.id)}><RotateCw class="icon-sm" aria-hidden="true" /> retry</Button>
  {:else}
    <!-- link-overlay: anchor covers the card; its aria-label is the title so the
         link's accessible name is the article title, not generic "open" -->
    <a class="card-link" href={`/read/${article.id}`} aria-label={content?.title ?? article.url}></a>
    <h3>{content?.title ?? article.url}</h3>
    {#if source}
      <div class="card-source"><SourcePill name={source.name} host={source.host} iconUrl={source.iconUrl} /></div>
    {/if}
    <div class="tags">
      {#each tags as t}<Tag>{t}</Tag>{/each}
    </div>
  {/if}

  {#if hasMenu}
    <div class="card-menu">
      <DropdownMenu label="article actions">
        {#snippet trigger()}<MoreHorizontal class="icon-sm" aria-hidden="true" />{/snippet}
        {#snippet children()}
          {#if onAddToCollection}
            <div class="menu-label">add to collection</div>
            {#if collections && collections.length > 0}
              {#each collections as c (c.id)}
                <MenuItem onSelect={() => onAddToCollection?.(article.id, c.id)}>
                  <FolderPlus class="icon-sm" aria-hidden="true" /> {c.name}
                </MenuItem>
              {/each}
            {:else}
              <div class="menu-empty">no collections yet</div>
            {/if}
          {/if}
          {#if onArchive || onUnarchive}
            {#if onAddToCollection}<div class="menu-sep"></div>{/if}
            {#if isArchived}
              <MenuItem onSelect={() => onUnarchive?.(article.id)}>
                <ArchiveRestore class="icon-sm" aria-hidden="true" /> unarchive
              </MenuItem>
            {:else}
              <MenuItem onSelect={() => onArchive?.(article.id)}>
                <Archive class="icon-sm" aria-hidden="true" /> archive
              </MenuItem>
            {/if}
          {/if}
          {#if onDelete}
            {#if onAddToCollection || onArchive || onUnarchive}<div class="menu-sep"></div>{/if}
            <MenuItem variant="danger" onSelect={() => (confirming = true)}>
              <Trash2 class="icon-sm" aria-hidden="true" /> delete
            </MenuItem>
          {/if}
        {/snippet}
      </DropdownMenu>
    </div>
    {#if onDelete}
      <ConfirmDialog
        open={confirming}
        title="delete this article?"
        message="this can't be undone."
        onConfirm={() => { confirming = false; onDelete?.(article.id); }}
        onCancel={() => (confirming = false)}
      />
    {/if}
  {/if}
</Card>

<style>
  .card-link { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
  .card-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
  h3, .tags { position: relative; z-index: 2; pointer-events: none; } /* text/tags don't block the overlay */
  .card-source { position: relative; z-index: 2; pointer-events: none; }

  .card-menu { position: relative; z-index: 3; align-self: flex-end; }
  .card-menu :global(.dropdown__trigger) {
    display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--color-text-muted); padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  }
  :global(.card):hover .card-menu :global(.dropdown__trigger),
  :global(.card):focus-within .card-menu :global(.dropdown__trigger),
  .card-menu :global(.dropdown__trigger[data-state="open"]) { opacity: 1; }
  .card-menu :global(.dropdown__trigger):hover { color: var(--color-accent); }
  .card-menu :global(.dropdown__trigger):focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); opacity: 1;
  }
  @media (hover: none) { .card-menu :global(.dropdown__trigger) { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .card-menu :global(.dropdown__trigger) { transition: none; } }

  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
