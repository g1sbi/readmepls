<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import { BookOpen, RotateCw, Trash2 } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";

  let {
    article,
    onRetry,
    onOpen,
    onDelete,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onOpen?: (id: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let confirming = $state(false);

  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  const tags = $derived<string[]>(content?.ai_tags_json ?? []);

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
  {:else}
    <h3>{content?.title ?? article.url}</h3>
    {#if state === "failed" || state === "partial"}
      <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
      <Button variant="accent" onclick={() => onRetry?.(article.id)}><RotateCw class="icon-sm" aria-hidden="true" /> retry</Button>
    {:else}
      <div class="tags">
        {#each tags as t}<Tag>{t}</Tag>{/each}
      </div>
      <Button onclick={() => onOpen?.(article.id)}><BookOpen class="icon-sm" aria-hidden="true" /> read</Button>
    {/if}
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
  .delete-btn {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: 0.1rem 0.4rem;
    align-self: flex-end;
  }
  .delete-btn:hover { color: var(--color-accent); }
  .delete-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }

  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
