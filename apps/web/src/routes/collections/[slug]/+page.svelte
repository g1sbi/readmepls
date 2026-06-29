<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  let name = $state("");
  let articles = $state<ArticleRecord[]>([]);
  let slug = $derived($page.params.slug);

  $effect(() => {
    const s = slug;
    (async () => {
      const pb = browserPb();
      // Use pb.filter binding to prevent injection
      const col = await pb.collection("collections").getFirstListItem(
        pb.filter("slug = {:slug}", { slug: s }),
      );
      name = col.name as string;
      const items = await pb.collection("collection_items").getFullList({
        // Use pb.filter binding for collection id — never raw interpolation
        filter: pb.filter("collection = {:cid}", { cid: col.id }),
        sort: "order",
        expand: "article.content",
      });
      // Map expanded records to ArticleRecord view-model, mirroring library/+page.svelte
      articles = items
        .map((i) => i.expand?.article as ArticleRecord | undefined)
        .filter((a): a is ArticleRecord => a != null);
    })();
  });
</script>

<svelte:head><title>{name}</title></svelte:head>
<div class="collection-view">
  <a class="back" href="/library">← library</a>
  <h1>{name}</h1>
  {#if articles.length === 0}
    <p class="empty-note">no articles in this collection yet.</p>
  {:else}
    <CardGrid>
      {#each articles as a (a.id)}
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </CardGrid>
  {/if}
</div>

<style>
  .collection-view { max-width: var(--width-prose); margin: 0 auto; }
  .back { font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; display: inline-block; margin-bottom: var(--space-3); }
  .back:hover { color: var(--color-text); }
  h1 { font-family: var(--font-display); color: var(--color-text); font-size: 1.6rem; margin: 0 0 1.25rem; }
  .empty-note { color: var(--color-text-muted); font-family: var(--font-display); text-align: center; padding: var(--space-6) 0; }
</style>
