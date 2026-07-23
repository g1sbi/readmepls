<!-- Desktop-only "get the extension!" pill. Lives in TopBar's `.right` cluster
     (hidden ≤640px). SaaS-only: never shown on self-hosted instances (they get
     the extension via the docs); on SaaS it shows only while the extension
     isn't detected. -->
<script lang="ts">
  import { Puzzle } from "@lucide/svelte";
  import { page } from "$app/stores";
  import { extensionStore } from "$lib/stores/extension.svelte.js";
  import GetExtensionDialog from "./GetExtensionDialog.svelte";

  let open = $state(false);
</script>

{#if !$page.data.selfHosted && !extensionStore.installed}
  <button type="button" class="get-ext" onclick={() => (open = true)}>
    <Puzzle class="icon-sm" aria-hidden="true" />
    <span>get the extension!</span>
  </button>
  <GetExtensionDialog bind:open />
{/if}

<style>
  /* App primary-button treatment: solid terracotta, compact for the top bar. */
  .get-ext {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0.35rem 0.7rem;
    border: none;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  .get-ext:hover {
    background: var(--color-accent-hover);
  }
  .get-ext:active {
    transform: translateY(1px);
  }
  .get-ext:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
</style>
