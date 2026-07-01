<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { splitHomeFeed } from "$lib/article/home-feed.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import CaptureBar from "$lib/components/CaptureBar.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";

  const pb = browserPb();
  let articles = $state<ArticleRecord[]>([]);
  let unsub: (() => void) | undefined;
  const feed = $derived(splitHomeFeed(articles));

  async function load() {
    const list = await pb.collection("articles").getList(1, 50, { sort: "-created", expand: "content" });
    articles = list.items as ArticleRecord[];
  }
  async function retry(id: string) {
    await fetch("/api/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: id }),
    });
  }

  onMount(async () => {
    await load();
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<section class="hero">
  <h1>save any link. <span>actually read it.</span></h1>
  <CaptureBar onCaptured={load} />
</section>

{#if feed.active.length}
  <section class="block">
    <h2>working on it</h2>
    <CardGrid>
      {#each feed.active as a (a.id)}
        <ArticleCard article={a} onRetry={retry} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </CardGrid>
  </section>
{/if}

{#if feed.recent.length}
  <section class="block">
    <h2>recently saved</h2>
    <CardGrid>
      {#each feed.recent as a (a.id)}
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </CardGrid>
    <a class="more" href="/library">see all in your library →</a>
  </section>
{/if}

<style>
  .hero { text-align: center; padding: var(--space-6) 0; }
  .hero h1 { font-family: var(--font-ui); font-size: var(--text-2xl); color: var(--color-text); margin: 0 0 var(--space-5); }
  .hero h1 span { color: var(--color-accent); }
  .block { margin-top: var(--space-6); }
  .block h2 { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-4); }
  .more { display: inline-block; margin-top: var(--space-4); font-family: var(--font-ui); color: var(--color-accent); text-decoration: none; }
  .more:hover { color: var(--color-accent-hover); }
</style>
