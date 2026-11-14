<script lang="ts">
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import TagEditor from "$lib/components/TagEditor.svelte";
  import { Folder, ExternalLink, Archive, Trash2 } from "@lucide/svelte";
  import type { CollectionSummary } from "$lib/collections/types.js";

  let {
    collections,
    originalUrl,
    tags,
    onAddTag,
    onRemoveTag,
    onAddToCollection,
    onArchive,
    onDelete,
    open,
    onClose,
  }: {
    collections: CollectionSummary[];
    originalUrl: string | null;
    tags: { id: string; name: string }[];
    onAddTag: (name: string) => void;
    onRemoveTag: (id: string) => void;
    onAddToCollection: (id: string) => void;
    onArchive: () => void;
    onDelete: () => void;
    open: boolean;
    onClose: () => void;
  } = $props();
</script>

<BottomSheet {open} {onClose} title="More">
  <h3 class="section">Tags</h3>
  <TagEditor {tags} onadd={onAddTag} onremove={onRemoveTag} />

  <h3 class="section">Add to collection</h3>
  <ul class="rows">
    {#each collections as c (c.id)}
      <li>
        <button data-testid="more-row" onclick={() => onAddToCollection(c.id)}>
          <Folder class="icon-md" aria-hidden="true" />
          {c.name}
          <span class="count">{c.count}</span>
        </button>
      </li>
    {:else}
      <li><p class="empty">No collections yet</p></li>
    {/each}
  </ul>

  <ul class="rows bordered">
    {#if originalUrl}
      <li>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- the article's own URL, off-site by definition -->
        <a
          data-testid="more-row"
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink class="icon-md" aria-hidden="true" />
          Open original
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </li>
    {/if}
    <li>
      <button data-testid="more-row" onclick={onArchive}>
        <Archive class="icon-md" aria-hidden="true" />
        Archive
      </button>
    </li>
    <li>
      <button class="danger" data-testid="more-row" onclick={onDelete}>
        <Trash2 class="icon-md" aria-hidden="true" />
        Delete
      </button>
    </li>
  </ul>
</BottomSheet>

<style>
  .section {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    margin: var(--space-4) 0 var(--space-2);
  }
  .section:first-child {
    margin-top: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* A hairline sets the article's own actions apart from the collections. */
  .rows.bordered {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-hairline);
  }
  .rows :global(a),
  .rows button {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    /* Thumb-sized rows: the sheet is the phone's only route to these. */
    min-height: 48px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    font: inherit;
    font-family: var(--font-ui);
    font-size: var(--text-md);
    color: var(--color-text);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .rows :global(svg) {
    color: var(--color-text-muted);
  }
  .rows button:hover,
  .rows a:hover {
    background: var(--color-surface-muted);
  }
  .rows button:focus-visible,
  .rows a:focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring);
    outline-offset: calc(-1 * var(--focus-ring-width));
  }
  .rows .danger,
  .rows .danger :global(svg) {
    color: var(--color-danger);
  }
  .count {
    margin-left: auto;
    color: var(--color-text-subtle);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    padding: var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
