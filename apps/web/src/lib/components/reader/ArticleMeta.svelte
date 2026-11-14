<script lang="ts">
  import SourcePill from "$lib/components/ui/SourcePill.svelte";
  import TagEditor from "$lib/components/TagEditor.svelte";
  import { readTimeLabel, savedLabel } from "$lib/reader/read-meta.js";
  import type { SourceView } from "$lib/source/source-view.js";
  import { ArrowUpRight } from "@lucide/svelte";

  let {
    source,
    originalUrl,
    readTime,
    created,
    tags,
    onAddTag,
    onRemoveTag,
  }: {
    source: SourceView | null;
    originalUrl: string | null;
    readTime: number | null;
    created: string;
    tags: { id: string; name: string }[];
    onAddTag: (name: string) => void;
    onRemoveTag: (id: string) => void;
  } = $props();

  const readLabel = $derived(readTimeLabel(readTime));
  const saved = $derived(savedLabel(created));
</script>

<div class="article-meta">
  {#if source}
    <div class="source">
      <SourcePill
        name={source.name}
        host={source.host}
        iconUrl={source.iconUrl}
      />
    </div>
  {/if}

  <div class="facts">
    {#if readLabel}<span>{readLabel}</span>{/if}
    {#if saved}<span>{saved}</span>{/if}
    {#if originalUrl}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the article's own URL, off-site by definition -->
      <a href={originalUrl} target="_blank" rel="noopener noreferrer">
        Open original<ArrowUpRight class="icon-sm" aria-hidden="true" />
      </a>
    {/if}
  </div>

  <div class="tags">
    <TagEditor {tags} onadd={onAddTag} onremove={onRemoveTag} />
  </div>
</div>

<style>
  .source {
    margin-bottom: var(--space-4);
  }
  /* Reading time · saved date · open original. Chrome, not prose: the UI font
     and the muted tone keep it out of the article's voice. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .facts a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    /* 44px tap target without a taller meta row. */
    min-height: 44px;
    color: var(--color-text);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .facts a:hover {
    text-decoration: underline;
    text-decoration-color: var(--color-marker);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }
  .facts a:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: var(--focus-ring-offset);
    border-radius: var(--radius-sm);
  }
  .tags {
    margin-top: var(--space-2);
  }
</style>
