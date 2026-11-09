<script lang="ts">
  import Card from "./ui/Card.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "./ui/spinner";
  import SourcePill from "./ui/SourcePill.svelte";
  import ConfirmAction from "./ConfirmAction.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import {
    RotateCw,
    Trash2,
    MoreHorizontal,
    Archive,
    ArchiveRestore,
    FolderPlus,
    ExternalLink,
  } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";
  import { sourceView } from "$lib/source/source-view.js";
  import { browserPb } from "$lib/pb.js";
  import { httpUrlOrNull } from "$lib/url/http-url.js";
  import { page } from "$app/stores";
  import { STARTED_THRESHOLD, FINISHED_THRESHOLD } from "@readmepls/core";
  import { resolve } from "$app/paths";

  // The subset of a content record this card renders. Structural (like the
  // ContentLike shapes in card-state.ts and source-view.ts) so the loosely
  // typed expand record the PocketBase SDK returns satisfies it without a cast.
  type CardContent = {
    title?: string;
    failure_reason?: string | null;
    ai_tags_json?: string[];
    extract_status?: string;
    expand?: { source?: unknown };
  };

  let {
    article,
    onRetry,
    onDelete,
    collections,
    onAddToCollection,
    onArchive,
    onUnarchive,
  }: {
    article: {
      id: string;
      url: string;
      status?: string;
      progress?: number;
      expand?: { content?: CardContent };
    };
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
  const hasMenu = $derived(
    !!(onAddToCollection || onArchive || onUnarchive || onDelete),
  );
  const showProgress = $derived(
    (article.progress ?? 0) > STARTED_THRESHOLD &&
      (article.progress ?? 0) < FINISHED_THRESHOLD,
  );

  // Show a clean hostname while processing; fall back to the raw URL if it
  // can't be parsed (e.g. malformed input mid-capture).
  function hostOf(u: string): string {
    try {
      return new URL(u).hostname;
    } catch {
      return u;
    }
  }
</script>

<Card>
  {#if state === "processing"}
    <Spinner label="Processing" />
    <span class="url">{hostOf(article.url)}</span>
  {:else if state === "failed" || state === "partial"}
    <h3>{content?.title ?? article.url}</h3>
    <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
    <Button onclick={() => onRetry?.(article.id)}
      ><RotateCw class="icon-sm" aria-hidden="true" /> retry</Button
    >
  {:else}
    <!-- link-overlay: anchor covers the card; its aria-label is the title so the
         link's accessible name is the article title, not generic "open" -->
    <a
      class="card-link"
      href={resolve("/read/[id]", { id: article.id })}
      aria-label={content?.title ?? article.url}
    ></a>
    <h3>{content?.title ?? article.url}</h3>
    {#if source}
      <div class="card-source">
        <SourcePill
          name={source.name}
          host={source.host}
          iconUrl={source.iconUrl}
        />
      </div>
    {/if}
    <div class="tags">
      {#each tags.filter((t) => t.trim()) as t (t)}<Badge variant="tag"
          >{t}</Badge
        >{/each}
    </div>
    {#if showProgress}
      <div
        class="progress-bar"
        style="--p: {article.progress}"
        aria-hidden="true"
      ></div>
    {/if}
  {/if}

  {#if hasMenu}
    <div class="card-menu">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon-sm"
              aria-label="article actions"
              ><MoreHorizontal class="icon-sm" aria-hidden="true" /></Button
            >
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item
            onSelect={() => {
              const u = httpUrlOrNull(article.url);
              if (u) window.open(u, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink class="icon-sm" aria-hidden="true" /> open original
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {#if onAddToCollection}
            <DropdownMenu.Label>add to collection</DropdownMenu.Label>
            {#if collections && collections.length > 0}
              {#each collections as c (c.id)}
                <DropdownMenu.Item
                  onSelect={() => onAddToCollection?.(article.id, c.id)}
                >
                  <FolderPlus class="icon-sm" aria-hidden="true" />
                  {c.name}
                </DropdownMenu.Item>
              {/each}
            {:else}
              <div class="px-3 py-2 text-sm text-muted-foreground">
                no collections yet
              </div>
            {/if}
          {/if}
          {#if onArchive || onUnarchive}
            {#if onAddToCollection}<DropdownMenu.Separator />{/if}
            {#if isArchived}
              <DropdownMenu.Item onSelect={() => onUnarchive?.(article.id)}>
                <ArchiveRestore class="icon-sm" aria-hidden="true" /> unarchive
              </DropdownMenu.Item>
            {:else}
              <DropdownMenu.Item onSelect={() => onArchive?.(article.id)}>
                <Archive class="icon-sm" aria-hidden="true" /> archive
              </DropdownMenu.Item>
            {/if}
          {/if}
          {#if onDelete}
            {#if onAddToCollection || onArchive || onUnarchive}<DropdownMenu.Separator
              />{/if}
            <DropdownMenu.Item
              variant="destructive"
              onSelect={() => (confirming = true)}
            >
              <Trash2 class="icon-sm" aria-hidden="true" /> delete
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    {#if onDelete}
      <ConfirmAction
        open={confirming}
        title="delete this article?"
        confirmLabel="delete"
        cancelLabel="cancel"
        message="this can't be undone."
        onConfirm={() => {
          confirming = false;
          onDelete?.(article.id);
        }}
        onCancel={() => (confirming = false)}
      />
    {/if}
  {/if}
</Card>

<style>
  .card-link {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }
  .card-link:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: 2px;
  }
  h3,
  .tags {
    position: relative;
    z-index: 2;
    pointer-events: none;
  } /* text/tags don't block the overlay */
  .card-source {
    position: relative;
    z-index: 2;
    pointer-events: none;
  }

  .card-menu {
    position: relative;
    z-index: 3;
    align-self: flex-end;
  }
  /* Hidden until the card is hovered/focused on fine pointers; the Button
     owns the rest of its look. */
  .card-menu :global([data-slot="dropdown-menu-trigger"]) {
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease-out);
  }
  :global(.card):hover .card-menu :global([data-slot="dropdown-menu-trigger"]),
  :global(.card):focus-within
    .card-menu
    :global([data-slot="dropdown-menu-trigger"]),
  .card-menu :global([data-slot="dropdown-menu-trigger"][data-state="open"]),
  .card-menu :global([data-slot="dropdown-menu-trigger"]:focus-visible) {
    opacity: 1;
  }
  @media (hover: none) {
    .card-menu :global([data-slot="dropdown-menu-trigger"]) {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card-menu :global([data-slot="dropdown-menu-trigger"]) {
      transition: none;
    }
  }

  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .progress-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: calc(var(--p) * 100%);
    background: var(--color-accent);
    z-index: 2;
    pointer-events: none; /* don't block clicks to card-link overlay */
  }
</style>
