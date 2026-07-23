<!-- Small pitch dialog for the published Chrome extension. Composes the
     shadcn-svelte dialog primitive (CLAUDE.md: no direct bits-ui imports).
     Copy is heading + one-liner + CTA only — no bullet list. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  const STORE_URL =
    "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="get-ext-dialog">
    <Dialog.Header>
      <Dialog.Title>save in one click</Dialog.Title>
      <Dialog.Description>
        save any page to your library in one click — no need to open the app.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <a class="cta" href={STORE_URL} target="_blank" rel="noopener">
        get the chrome extension
      </a>
      <Dialog.Close class="later">maybe later</Dialog.Close>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-family: var(--font-ui);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .cta:hover {
    filter: brightness(0.96);
  }
  :global(.get-ext-dialog .later) {
    min-height: 44px;
    font-family: var(--font-ui);
    color: var(--color-text-muted);
  }
</style>
