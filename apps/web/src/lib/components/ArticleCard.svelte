<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
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
</script>

<Card>
  {#if state === "processing"}
    <Spinner label="Processing" />
    <span>{article.url}</span>
  {:else}
    <h3>{content?.title ?? article.url}</h3>
    {#if state === "failed" || state === "partial"}
      <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
      <Button variant="accent" onclick={() => onRetry?.(article.id)}>Retry</Button>
    {:else}
      <div class="tags">
        {#each tags as t}<Tag>{t}</Tag>{/each}
      </div>
      <Button onclick={() => onOpen?.(article.id)}>Read</Button>
    {/if}
  {/if}
  {#if onDelete}
    <button class="delete-btn" onclick={() => (confirming = true)} aria-label="delete article">delete</button>
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
</style>
