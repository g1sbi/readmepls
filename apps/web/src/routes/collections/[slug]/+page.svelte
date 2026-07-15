<script lang="ts">
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import { ArrowLeft } from "@lucide/svelte";

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
  <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
  <h1>{name}</h1>
  {#if articles.length === 0}
    <p class="empty-note">no articles in this collection yet.</p>
  {:else}
    <CardGrid>
      {#each articles as a (a.id)}
        <ArticleCard article={a} />
      {/each}
    </CardGrid>
  {/if}
</div>

<style>
  .collection-view { max-width: var(--width-prose); margin: 0 auto; }
  .back { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); color: var(--color-text-muted); text-decoration: none; margin-bottom: var(--space-3); }
  .back:hover { color: var(--color-text); }
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }
  .empty-note { color: var(--color-text-muted); font-family: var(--font-ui); text-align: center; padding: var(--space-6) 0; }
</style>
