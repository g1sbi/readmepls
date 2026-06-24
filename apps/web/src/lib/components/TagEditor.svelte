<script lang="ts">
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
    <span class="chip">
      {t.name}
      <button aria-label={`remove ${t.name}`} onclick={() => onremove(t.id)}>×</button>
    </span>
  {/each}
  <form onsubmit={submit}>
    <input aria-label="add tag" placeholder="add tag…" bind:value={draft} />
  </form>
</div>

<style>
  .tag-editor { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: var(--color-surface-sunken); border-radius: var(--radius-pill);
    padding: 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text);
  }
  .chip button { background: none; border: none; cursor: pointer; color: var(--color-text-muted); }
  input {
    border: none; border-bottom: 1px solid var(--color-border);
    background: transparent; font: inherit; color: var(--color-text);
  }
</style>
