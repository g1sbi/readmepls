<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import type { ArticleRecord } from "$lib/article/record.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";

  const pb = browserPb();
  let articles = $state<ArticleRecord[]>([]);
  let loading = $state(true);
  let unsub: (() => void) | undefined;

  async function load() {
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content" });
    articles = list.items as ArticleRecord[];
    loading = false;
  }

  onMount(async () => {
    await load();
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

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
    {#each articles as a (a.id)}
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
</style>
