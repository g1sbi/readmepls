<script lang="ts">
  let { code }: { code: string } = $props();
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="code-block">
  <button class="copy" type="button" onclick={copy}>{copied ? "copied!" : "copy"}</button>
  <pre><code>{code}</code></pre>
</div>

<style>
  .code-block {
    position: relative;
    text-align: left;
    background: var(--surface-1);
    border: 1px solid var(--fold);
    border-radius: 16px;
    padding: 1.25rem;
    overflow-x: auto;
  }
  pre {
    margin: 0;
    font-family: "Fira Code", "SFMono-Regular", Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    white-space: pre;
  }
  .copy {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    font-family: var(--font);
    font-weight: 600;
    font-size: 0.75rem;
    border: 1px solid var(--fold);
    border-radius: 999px;
    background: var(--surface-0);
    color: var(--ink);
    padding: 0.35rem 0.9rem;
    cursor: pointer;
  }
  .copy:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
