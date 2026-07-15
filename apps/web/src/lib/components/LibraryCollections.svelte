<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";
  import CollectionFolder from "./ui/CollectionFolder.svelte";
  import { Plus } from "@lucide/svelte";

  let {
    collections,
    error = "",
    onCreate,
  }: {
    collections: { id: string; name: string; slug: string; count: number }[];
    error?: string;
    onCreate: (name: string) => void;
  } = $props();

  let creating = $state(false);
  let draft = $state("");

  function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    draft = "";
    creating = false;
  }
</script>

<section class="collections" aria-label="collections">
  <h2 class="heading">collections</h2>

  {#if collections.length}
    <nav class="tiles" aria-label="your collections">
      {#each collections as c (c.id)}
        <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
      {/each}
    </nav>
  {:else}
    <p class="empty-hint">no collections yet — group articles into folders to find them fast.</p>
  {/if}

  <div class="create">
    {#if creating}
      <form class="create-form" onsubmit={submitCreate}>
        <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
        <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
      </form>
    {:else}
      <button class="new-btn" onclick={() => (creating = true)}>
        <Plus class="icon-sm" aria-hidden="true" /> new collection
      </button>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
</section>

<style>
  .collections { margin: 0 0 var(--space-4); }
  .heading { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
  .tiles { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-2); }
  .empty-hint { color: var(--color-text-muted); font-family: var(--font-ui); font-size: var(--text-sm); margin: 0 0 var(--space-2); }
  .create { display: flex; flex-direction: column; gap: var(--space-1); }
  .create-form { display: flex; align-items: center; gap: var(--space-1); }
  .new-btn { display: inline-flex; align-items: center; gap: var(--space-1); align-self: flex-start; background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); padding: var(--space-2); }
  .new-btn:hover { color: var(--color-accent-hover); }
  .new-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .error { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-danger); }

  /* Mobile (≤640px): current strip behavior. Hide header + create + empty hint;
     tiles become a horizontal scroll strip; collapse to no footprint when empty. */
  @media (max-width: 640px) {
    .collections { margin: 0; }
    .heading, .create, .empty-hint { display: none; }
    .tiles { flex-wrap: nowrap; overflow-x: auto; margin: 0 0 var(--space-3); padding-bottom: var(--space-2); scrollbar-width: thin; }
    .tiles > :global(*) { flex: none; }
  }
</style>
