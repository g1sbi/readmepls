<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import { RotateCw, Trash2 } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";
  import { page } from "$app/stores";

  let {
    article,
    onRetry,
    onDelete,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let confirming = $state(false);

  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  // AI tags are a Pro feature — a standard-tier viewer never sees them, even
  // if this shared content row has them (e.g. a different, pro-tier user
  // captured this URL first). See docs/superpowers/specs/2026-07-02-phase-8-tiering-entitlements-design.md §3.
  const isPro = $derived($page.data.tier === "pro");
  const tags = $derived<string[]>(isPro ? (content?.ai_tags_json ?? []) : []);

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
    <div class="tags">
      {#each tags as t}<Tag>{t}</Tag>{/each}
    </div>
  {/if}

  {#if onDelete}
    <button class="delete-btn" onclick={() => (confirming = true)} aria-label="delete article"><Trash2 class="icon-sm" aria-hidden="true" /></button>
    <ConfirmDialog
      open={confirming}
      title="delete this article?"
      message="this can't be undone."
      onConfirm={() => { confirming = false; onDelete?.(article.id); }}
      onCancel={() => (confirming = false)}
    />
  {/if}
</Card>

<style>
  .card-link { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
  .card-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
  h3, .tags { position: relative; z-index: 2; pointer-events: none; } /* text/tags don't block the overlay */
  .delete-btn {
    position: relative; z-index: 3; align-self: flex-end;
    display: inline-flex; align-items: center;
    background: none; border: none; cursor: pointer; font: inherit;
    font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-1) var(--space-2);
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  }
  :global(.card):hover .delete-btn,
  :global(.card):focus-within .delete-btn { opacity: 1; }
  .delete-btn:hover { color: var(--color-accent); }
  .delete-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); opacity: 1; }
  @media (hover: none) { .delete-btn { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .delete-btn { transition: none; } }
  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
