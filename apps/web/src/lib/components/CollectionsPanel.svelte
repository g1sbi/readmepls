<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";
  import { Folder, Pencil, Trash2, Check, X, Plus } from "@lucide/svelte";

  let {
    collections,
    error = "",
    oncreate,
    onrename,
    ondelete,
  }: {
    collections: { id: string; name: string; slug: string }[];
    error?: string;
    oncreate: (name: string) => void;
    onrename: (id: string, name: string) => void;
    ondelete: (id: string) => void;
  } = $props();

  let renameTarget = $state<string | null>(null);
  let renameDraft = $state("");
  let creating = $state(false);
  let draft = $state("");

  function startRename(id: string, name: string) { renameTarget = id; renameDraft = name; }
  function submitRename(e: SubmitEvent) {
    e.preventDefault();
    const name = renameDraft.trim();
    if (name) onrename(renameTarget!, name);
    renameTarget = null;
  }
  function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    oncreate(name);
    draft = ""; creating = false;
  }
</script>

<section class="panel" aria-label="collections">
  <h2 class="panel-heading">collections</h2>
  <ul class="list">
    {#each collections as col (col.id)}
      <li class="row">
        {#if renameTarget === col.id}
          <form class="edit" onsubmit={submitRename}>
            <Input bind:value={renameDraft} placeholder="collection name" aria-label="rename collection" />
            <button type="submit" class="icon-btn" aria-label="save"><Check class="icon-sm" aria-hidden="true" /></button>
            <button type="button" class="icon-btn" aria-label="cancel" onclick={() => (renameTarget = null)}><X class="icon-sm" aria-hidden="true" /></button>
          </form>
        {:else}
          <a class="row-link" href={`/collections/${col.slug}`}>
            <Folder class="icon-sm folder" aria-hidden="true" />
            <span class="name">{col.name}</span>
          </a>
          <div class="row-actions">
            <button class="icon-btn" aria-label={`rename ${col.name}`} onclick={() => startRename(col.id, col.name)}><Pencil class="icon-sm" aria-hidden="true" /></button>
            <button class="icon-btn danger" aria-label={`delete ${col.name}`} onclick={() => ondelete(col.id)}><Trash2 class="icon-sm" aria-hidden="true" /></button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if creating}
    <form class="create" onsubmit={submitCreate}>
      <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
      <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
    </form>
  {:else}
    <button class="new-btn" onclick={() => (creating = true)}><Plus class="icon-sm" aria-hidden="true" /> new collection</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: var(--space-2); }
  .panel-heading { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); border-radius: var(--radius-sm); }
  .row-link { display: inline-flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; padding: var(--space-2); text-decoration: none; color: var(--color-text); font-family: var(--font-ui); font-size: var(--text-sm); border-radius: var(--radius-sm); }
  .row-link:hover { background: var(--color-surface-sunken); }
  .row-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .row-link :global(.folder) { color: var(--color-text-subtle); flex: none; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-actions { display: flex; gap: var(--space-1); opacity: 0; transition: opacity var(--dur-fast) var(--ease-out); }
  .row:hover .row-actions, .row:focus-within .row-actions { opacity: 1; }
  @media (hover: none) { .row-actions { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .row-actions { transition: none; } }
  .icon-btn { display: inline-flex; align-items: center; background: none; border: none; cursor: pointer; color: var(--color-text-muted); padding: var(--space-1); border-radius: var(--radius-xs); }
  .icon-btn:hover { color: var(--color-text); }
  .icon-btn.danger:hover { color: var(--color-accent); }
  .icon-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .edit, .create { display: flex; align-items: center; gap: var(--space-1); flex: 1; }
  .new-btn { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); padding: var(--space-2); }
  .new-btn:hover { color: var(--color-accent-hover); }
  .new-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .error { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-accent); }
</style>
