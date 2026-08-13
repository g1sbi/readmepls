<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, label }: { children: Snippet; label?: string } = $props();
</script>

<aside class="rail" aria-label={label}>{@render children()}</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }
  /* Pinned reading tools. Two things keep it actually usable while the article
     scrolls: it pins BELOW the sticky TopBar (which paints over .page and would
     otherwise cover its first rows), and it never grows past the viewport — a
     long chapters list would otherwise push the text controls, tags and actions
     below the fold, where no amount of scrolling brings them back. */
  @media (min-width: 1024px) {
    .rail {
      position: sticky;
      top: calc(var(--topbar-h) + var(--space-4));
      align-self: start;
      max-height: calc(100dvh - var(--topbar-h) - 2 * var(--space-4));
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
</style>
