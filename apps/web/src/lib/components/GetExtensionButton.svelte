<!-- Desktop-only "get the extension!" pill. Lives in TopBar's `.right` cluster
     (hidden ≤640px), and only while the extension isn't detected. -->
<script lang="ts">
  import { Puzzle } from "@lucide/svelte";
  import { extensionStore } from "$lib/stores/extension.svelte.js";
  import GetExtensionDialog from "./GetExtensionDialog.svelte";

  let open = $state(false);
</script>

{#if !extensionStore.installed}
  <button type="button" class="get-ext" onclick={() => (open = true)}>
    <Puzzle class="icon-sm" aria-hidden="true" />
    <span>get the extension!</span>
  </button>
  <GetExtensionDialog bind:open />
{/if}

<style>
  .get-ext {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-accent-wash);
    color: var(--color-text);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .get-ext:hover {
    border-color: var(--color-ring);
  }
  .get-ext:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
</style>
