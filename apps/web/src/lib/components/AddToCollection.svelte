<script lang="ts">
  let { collections, onadd, oncreate }: {
    collections: { id: string; name: string }[];
    onadd: (collectionId: string) => void;
    oncreate: (name: string) => void;
  } = $props();
  let draft = $state("");
  function create(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (name) { oncreate(name); draft = ""; }
  }
</script>

<div class="add-to-collection">
  <ul>
    {#each collections as c (c.id)}
      <li><button onclick={() => onadd(c.id)}>{c.name}</button></li>
    {/each}
  </ul>
  <form onsubmit={create}>
    <input aria-label="new collection" placeholder="new collection…" bind:value={draft} />
  </form>
</div>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  button { background: none; border: none; text-align: left; cursor: pointer; color: var(--color-text); font: inherit; }
  input { border: none; border-bottom: 1px solid var(--color-border); background: transparent; font: inherit; color: var(--color-text); }
</style>
