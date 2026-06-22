<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import { deriveCardState } from "$lib/article/card-state.js";

  let {
    article,
    onRetry,
    onOpen,
  }: {
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onOpen?: (id: string) => void;
  } = $props();

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
</Card>
