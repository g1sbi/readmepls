<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";
  import { BookmarkPlus } from "@lucide/svelte";

  let { onCaptured }: { onCaptured?: () => void } = $props();
  let url = $state("");
  let busy = $state(false);
  let err = $state("");

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
        err = "Quota exceeded — upgrade to capture more.";
        return;
      }
      if (!res.ok) {
        err = "Could not capture that link.";
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
  <Input bind:value={url} placeholder="Paste a link…" type="url" />
  <Button type="submit" variant="accent" disabled={busy}><BookmarkPlus class="icon-sm" aria-hidden="true" /> {busy ? "saving…" : "save it"}</Button>
  {#if err}<p role="alert">{err}</p>{/if}
</form>

<style>
  form { display: flex; gap: 0.6rem; max-width: 640px; margin: 0 auto; align-items: center; }
  form :global(input) { flex: 1; font-size: 1.05rem; padding: 0.7rem 0.9rem; }
  p { flex-basis: 100%; margin: 0.5rem 0 0; color: var(--color-danger); font-family: var(--font-display); font-size: 0.9rem; }
</style>
