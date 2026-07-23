<!-- Pitch dialog for the published Chrome extension. Composes the shadcn-svelte
     dialog primitive (CLAUDE.md: no direct bits-ui imports). Single surface: no
     footer bar, no separator — just a focal mark, one readable line, one CTA.
     The X in the corner (Dialog.Content default) is the only dismiss control. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Puzzle } from "@lucide/svelte";

  const STORE_URL =
    "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="get-ext-dialog sm:max-w-sm p-6">
    <!-- Title kept for accessibility (Dialog requires one) but not shown. -->
    <Dialog.Header class="sr-only">
      <Dialog.Title>get the readmepls extension</Dialog.Title>
    </Dialog.Header>
    <div class="pitch">
      <span class="badge">
        <Puzzle class="badge-icon" aria-hidden="true" />
      </span>
      <Dialog.Description class="text-foreground text-base leading-relaxed">
        save any page to your library in one click — no need to open the app.
      </Dialog.Description>
      <a class="cta" href={STORE_URL} target="_blank" rel="noopener">
        get the chrome extension
      </a>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .pitch {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-4);
    padding-top: var(--space-2);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-pill);
    background: var(--color-accent-wash);
    color: var(--color-accent);
  }
  :global(.get-ext-dialog .badge-icon) {
    width: 1.5rem;
    height: 1.5rem;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-family: var(--font-ui);
    font-weight: var(--weight-medium);
    text-decoration: none;
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  .cta:hover {
    background: var(--color-accent-hover);
  }
  .cta:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
</style>
