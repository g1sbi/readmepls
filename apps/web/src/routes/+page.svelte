<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { splitHomeFeed } from "$lib/article/home-feed.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import CaptureBar from "$lib/components/CaptureBar.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

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
    <div class="grid">
      {#each feed.active as a (a.id)}
        <ArticleCard article={a} onRetry={retry} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </div>
  </section>
{/if}

{#if feed.recent.length}
  <section class="block">
    <h2>recently saved</h2>
    <div class="grid">
      {#each feed.recent as a (a.id)}
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </div>
    <a class="more" href="/library">see all in your library →</a>
  </section>
{/if}

<style>
  .hero { text-align: center; padding: 2.5rem 0 2rem; }
  .hero h1 { font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.8rem); color: var(--color-text); margin: 0 0 1.5rem; }
  .hero h1 span { color: var(--color-accent); }
  .block { margin-top: 2.5rem; }
  .block h2 { font-family: var(--font-display); font-size: 1.1rem; color: var(--color-text-muted); margin: 0 0 0.9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .more { display: inline-block; margin-top: 1rem; font-family: var(--font-display); color: var(--color-accent); text-decoration: none; }
  .more:hover { color: var(--color-accent-hover); }
</style>
