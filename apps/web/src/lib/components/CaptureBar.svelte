<!-- apps/web/src/lib/components/CaptureBar.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { BookmarkPlus, ArrowUp } from "@lucide/svelte";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { createTypewriter } from "$lib/typewriter.svelte.js";

  const DEFAULT_PLACEHOLDERS = [
    "en.wikipedia.org/wiki/…",
    "a youtube video",
    "that newsletter you never open",
    "any blog post, really",
  ];

  let {
    onCaptured,
    placeholders = DEFAULT_PLACEHOLDERS,
  }: { onCaptured?: () => void; placeholders?: string[] } = $props();

  let url = $state("");
  let busy = $state(false);
  let err = $state("");
  let focused = $state(false);

  // pause the animation whenever the user is engaged, so it never types over them
  // placeholders is a one-time initializer for the animation, not reactively swapped
  // svelte-ignore state_referenced_locally
  const tw = createTypewriter(placeholders, {
    paused: () => focused || url.trim() !== "",
  });
  onMount(() => tw.start());
  onDestroy(() => tw.stop());

  async function submit() {
    if (!url.trim()) return;
    busy = true;
    err = "";
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 402) {
        err = "quota exceeded — upgrade to capture more.";
        return;
      }
      if (!res.ok) {
        err = "could not capture that link.";
        return;
      }
      url = "";
      onCaptured?.();
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <InputGroup.Root class="mx-auto h-14 max-w-xl rounded-full pl-2 pr-1.5 shadow-sm">
    <InputGroup.Addon>
      <BookmarkPlus aria-hidden="true" />
    </InputGroup.Addon>
    <InputGroup.Input
      type="url"
      bind:value={url}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      placeholder={focused ? "paste a link…" : tw.text}
      aria-label="paste a link to save"
      class="text-base"
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        type="submit"
        variant="default"
        size="icon-sm"
        class="size-11 rounded-full"
        aria-label="save link"
        aria-busy={busy}
        disabled={busy}
      >
        <ArrowUp aria-hidden="true" />
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
  {#if err}<p class="capture-error" role="alert">{err}</p>{/if}
</form>

<style>
  form {
    max-width: 640px;
    margin: 0 auto;
  }
  .capture-error {
    margin: var(--space-3) 0 0;
    text-align: center;
    color: var(--color-danger);
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }
</style>
