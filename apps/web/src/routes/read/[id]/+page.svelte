<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { withReaderDefaults } from "@readmepls/core";
  import type { ReaderPrefs } from "@readmepls/types";
  import { readerCssVars } from "$lib/reader/css-vars.js";
  import ReaderControls from "$lib/components/ReaderControls.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";

  const pb = browserPb();
  let article = $state<any>(null);
  let content = $state<any>(null);
  let prefs = $state<ReaderPrefs>(withReaderDefaults());

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function savePrefs(next: ReaderPrefs) {
    prefs = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const uid = pb.authStore.model?.id;
      if (uid) pb.collection("users").update(uid, { reader_prefs: next });
    }, 500);
  }

  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      const max = document.body.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (article) pb.collection("articles").update(article.id, { progress: p });
    }, 400);
  }

  onMount(async () => {
    const id = $page.params.id;
    if (!id) return;
    article = await pb.collection("articles").getOne(id, { expand: "content" });
    content = article.expand?.content ?? null;

    const uid = pb.authStore.model?.id;
    if (uid) {
      const me = await pb.collection("users").getOne(uid);
      prefs = withReaderDefaults(me.reader_prefs ?? undefined);
    }
    if (article.status === "unread") {
      await pb.collection("articles").update(article.id, { status: "reading" });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  });

  // An async onMount can't register a cleanup; tear down the listener here.
  onDestroy(() => {
    if (typeof window !== "undefined") window.removeEventListener("scroll", onScroll);
  });

  async function archive() {
    if (article) await pb.collection("articles").update(article.id, { status: "archived" });
  }
</script>

<ReaderControls {prefs} onChange={savePrefs} />
<Button onclick={archive}>Archive</Button>

{#if !content}
  <Spinner label="Loading article" />
{:else}
  <article data-theme={prefs.theme} style={readerCssVars(prefs)} class="reader">
    <h1>{content.title}</h1>
    <!-- content_html is sanitized in the worker (Task 2) before storage -->
    {@html content.content_html}
  </article>
{/if}

<style>
  .reader {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--reader-font);
    font-size: var(--reader-size);
    line-height: var(--reader-line-height);
    max-width: var(--reader-width);
    margin: 0 auto;
  }
</style>
