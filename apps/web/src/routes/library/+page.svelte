<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import Tag from "$lib/components/ui/Tag.svelte";

  const pb = browserPb();
  let articles = $state<ArticleRecord[]>([]);
  let loading = $state(true);
  let unsub: (() => void) | undefined;

  // Tag rail state
  let tags = $state<{ id: string; name: string }[]>([]);
  let selectedTag = $state<string | null>(null);
  let taggedArticleIds = $state<Set<string>>(new Set());

  let visible = $derived(
    selectedTag === null ? articles : articles.filter((a) => taggedArticleIds.has(a.id)),
  );

  async function load() {
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content" });
    articles = list.items as ArticleRecord[];
    loading = false;
  }

  async function loadTags() {
    const raw = await pb.collection("tags").getFullList({ sort: "name" });
    tags = raw.map((t) => ({ id: t.id, name: t.name as string }));
  }

  async function selectTag(tagId: string | null) {
    selectedTag = tagId;
    if (tagId === null) {
      taggedArticleIds = new Set();
      return;
    }
    // Use pb.filter binding to prevent injection — never raw string interpolation.
    const links = await pb
      .collection("article_tags")
      .getFullList({ filter: pb.filter("tag = {:tagId}", { tagId }) });
    taggedArticleIds = new Set(links.map((l) => l.article as string));
  }

  onMount(async () => {
    await Promise.all([load(), loadTags()]);
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

{#if tags.length > 0}
  <nav class="tag-rail" aria-label="Filter by tag">
    <button
      class="tag-chip"
      class:selected={selectedTag === null}
      onclick={() => selectTag(null)}
      aria-pressed={selectedTag === null}
    >
      <Tag>all</Tag>
    </button>
    {#each tags as t (t.id)}
      <button
        class="tag-chip"
        class:selected={selectedTag === t.id}
        onclick={() => selectTag(t.id)}
        aria-pressed={selectedTag === t.id}
      >
        <Tag>{t.name}</Tag>
      </button>
    {/each}
  </nav>
{/if}

{#if loading}
  <CardGrid>
    {#each Array(6) as _}
      <div class="skeleton" aria-hidden="true"></div>
    {/each}
  </CardGrid>
{:else if articles.length === 0}
  <div class="empty">
    <p>nothing saved yet. paste a link on the <a href="/">extract page</a> ☝</p>
  </div>
{:else}
  <CardGrid>
    {#each visible as a (a.id)}
      <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
    {/each}
  </CardGrid>
{/if}

<style>
  h1 { font-family: var(--font-display); color: var(--color-text); font-size: 1.6rem; margin: 0 0 1.25rem; }
  .skeleton { height: 9rem; border-radius: var(--radius-lg); background: var(--color-surface-sunken); animation: pulse var(--dur-slow) var(--ease-out) infinite alternate; }
  @keyframes pulse { to { opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
  .empty {
    text-align: center; padding: 3rem 1rem; background: var(--color-surface);
    border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); position: relative;
  }
  /* dog-ear fold */
  .empty::after {
    content: ""; position: absolute; top: 0; right: 0; width: 40px; height: 40px;
    background: var(--color-fold); clip-path: polygon(100% 0, 0 0, 100% 100%);
    border-top-right-radius: var(--radius-xl);
  }
  .empty p { font-family: var(--font-display); color: var(--color-text-muted); }
  .empty a { color: var(--color-accent); }

  .tag-rail {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0 0 1.25rem;
  }
  .tag-chip {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tag-chip:hover :global(.tag) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .tag-chip.selected :global(.tag) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
  }
</style>
