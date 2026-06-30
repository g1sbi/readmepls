<script lang="ts">
  // Decorative loading placeholder with a shimmer sweep. aria-hidden so it is
  // never announced. Shimmer is disabled under prefers-reduced-motion.
  let { lines = 1, radius = "var(--radius-md)" }: { lines?: number; radius?: string } = $props();
</script>

<div class="skeleton" aria-hidden="true">
  {#each Array(lines) as _}
    <span class="skeleton-line" style="border-radius: {radius};"></span>
  {/each}
</div>

<style>
  .skeleton { display: flex; flex-direction: column; gap: var(--space-2); }
  .skeleton-line {
    display: block;
    height: 1rem;
    background: linear-gradient(
      90deg,
      var(--color-surface-sunken) 0%,
      var(--color-surface-raised) 50%,
      var(--color-surface-sunken) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-line { animation: none; background: var(--color-surface-sunken); }
  }
</style>
