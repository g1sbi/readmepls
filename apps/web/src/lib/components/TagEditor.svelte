<script lang="ts">
  import Chip from "./ui/Chip.svelte";
  let { tags, onadd, onremove }: {
    tags: { id: string; name: string }[];
    onadd: (name: string) => void;
    onremove: (id: string) => void;
  } = $props();
  let draft = $state("");

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (name) { onadd(name); draft = ""; }
  }
</script>

<div class="tag-editor">
  {#each tags as t (t.id)}
    <Chip>
      {t.name}
      {#snippet trailing()}
        <button aria-label={`remove ${t.name}`} onclick={() => onremove(t.id)}>×</button>
      {/snippet}
    </Chip>
  {/each}
  <form onsubmit={submit}>
    <input aria-label="add tag" placeholder="add tag…" bind:value={draft} />
  </form>
</div>

<style>
  .tag-editor { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .tag-editor :global(.chip button) { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font: inherit; }
  input {
    border: none; border-bottom: 1px solid var(--color-border);
    background: transparent; font: inherit; color: var(--color-text);
  }
</style>
