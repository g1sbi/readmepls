<script lang="ts">
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import { listConnectors } from "@readmepls/core";
  import { resolve } from "$app/paths";
  import { Button } from "$lib/components/ui/button";
  import { ArrowLeft } from "@lucide/svelte";

  const connectors = listConnectors().map((c) => ({
    type: c.type,
    stub: c.stub,
  }));
</script>

<svelte:head><title>connectors · settings</title></svelte:head>

<section class="connectors">
  <Button variant="ghost" size="sm" href={resolve("/settings")}
    ><ArrowLeft aria-hidden="true" />Settings</Button
  >
  <PageHeader title="Connectors" />
  <p class="lede">send your clean articles where they belong.</p>

  <ul class="list">
    {#each connectors as c (c.type)}
      <li class="connector" class:disabled={c.stub}>
        <span class="name">{c.type}</span>
        {#if c.stub}
          <span class="badge">coming soon</span>
        {:else}
          <a class="action" href={resolve("/api/export?scope=library")}
            >export library</a
          >
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .connectors {
    max-width: var(--width-narrow);
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
  .lede {
    color: var(--color-text-muted);
    margin-bottom: var(--space-5);
  }
  .list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .connector {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .connector.disabled {
    opacity: 0.55;
  }
  .name {
    font-family: var(--font-ui);
    color: var(--color-text);
    text-transform: lowercase;
  }
  .badge {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .action {
    color: var(--color-accent);
    text-decoration: none;
    font-weight: 600;
  }
</style>
