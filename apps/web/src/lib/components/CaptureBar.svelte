<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";

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
  <Button type="submit" disabled={busy}>Save</Button>
  {#if err}<p role="alert">{err}</p>{/if}
</form>
