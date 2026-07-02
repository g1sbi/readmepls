<script lang="ts">
  import { Globe } from "@lucide/svelte";
  let { name = null, host, iconUrl = null }: {
    name?: string | null;
    host: string;
    iconUrl?: string | null;
  } = $props();
  const label = $derived(name || host);
</script>

<span class="source-pill" title={host}>
  {#if iconUrl}
    <img class="favicon" src={iconUrl} alt="" width="16" height="16" loading="lazy" />
  {:else}
    <Globe class="icon-sm favicon-fallback" aria-hidden="true" />
  {/if}
  <span class="label">{label}</span>
</span>

<style>
  .source-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    max-width: 100%;
  }
  .favicon {
    width: var(--icon-sm);
    height: var(--icon-sm);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    object-fit: contain;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
