<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { prefersReducedMotion } from "$lib/motion";

  let { phrases, intervalMs = 4000 }: { phrases: string[]; intervalMs?: number } =
    $props();

  let index = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    if (prefersReducedMotion() || phrases.length < 2) return;
    timer = setInterval(() => {
      index = (index + 1) % phrases.length;
    }, intervalMs);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<!-- decorative animation; the page's visually-hidden <h1> carries the real heading -->
<p class="greeting" aria-hidden="true">
  {#key index}
    <span class="phrase">{phrases[index]}</span>
  {/key}
</p>

<style>
  .greeting {
    /* --font-ui, not --font-display: Fredoka is wordmark-only per tokens.css */
    font-family: var(--font-ui);
    font-size: var(--text-xl);
    color: var(--color-text);
    margin: 0 0 var(--space-5);
    min-height: 1.4em; /* reserve height so the pill doesn't jump between phrases */
  }
  @media (min-width: 48rem) {
    .greeting {
      font-size: var(--text-2xl);
    }
  }
  .phrase {
    display: inline-block;
    animation: fade-in var(--dur-slow, 320ms) var(--ease-out, ease) both;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .phrase {
      animation: none;
    }
  }
</style>
