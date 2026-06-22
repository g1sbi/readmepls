<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import CaptureBar from "$lib/components/CaptureBar.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  const pb = browserPb();
  let articles = $state<any[]>([]);
  let unsub: (() => void) | undefined;

  async function load() {
    const list = await pb.collection("articles").getList(1, 50, {
      sort: "-created",
      expand: "content",
    });
    articles = list.items;
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
    // Realtime: PB list rule (user = auth.id) scopes events to this user.
    unsub = await pb.collection("articles").subscribe("*", () => load(), {
      expand: "content",
    });
  });
  onDestroy(() => unsub?.());
</script>

<main>
  <CaptureBar onCaptured={load} />
  <section class="grid">
    {#each articles as a (a.id)}
      <ArticleCard article={a} onRetry={retry} onOpen={(id) => goto(`/read/${id}`)} />
    {/each}
  </section>
</main>
