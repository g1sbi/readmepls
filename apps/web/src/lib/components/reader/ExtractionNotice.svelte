<script lang="ts">
  import { TriangleAlert, RotateCw, ExternalLink } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";

  let {
    status,
    reason,
    originalUrl,
    onRetry,
  }: {
    status: "failed" | "partial";
    reason: string | null;
    originalUrl: string | null;
    onRetry?: () => void;
  } = $props();

  // Partial text is already on the page, so the notice only explains itself;
  // a failed one has to offer the way on.
  const lead = $derived(
    status === "failed"
      ? "This page couldn't be saved."
      : "Some of this page is missing.",
  );
  const detail = $derived(reason ?? "We couldn't read this page.");
</script>

<div class="notice" data-status={status}>
  <TriangleAlert class="icon-md" aria-hidden="true" />
  <div>
    <p><b>{lead}</b> {detail}</p>
    {#if status === "failed"}
      <div class="acts">
        {#if onRetry}
          <Button variant="outline" size="sm" onclick={onRetry}>
            <RotateCw aria-hidden="true" /> Retry
          </Button>
        {/if}
        {#if originalUrl}
          <!-- eslint-disable svelte/no-navigation-without-resolve -- the article's own URL, off-site by definition -->
          <Button
            size="sm"
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink aria-hidden="true" /> Open original
          </Button>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .notice {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--color-text);
  }
  .notice :global(svg) {
    margin-top: 1px;
    color: var(--color-warning);
    flex-shrink: 0;
  }
  p {
    margin: 0;
  }
  b {
    font-weight: var(--weight-medium);
  }
  .acts {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }
  /* The buttons carry their own icons; don't tint them like the lead icon. */
  .acts :global(svg) {
    margin-top: 0;
    color: inherit;
  }
</style>
