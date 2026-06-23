<script lang="ts">
  let { label = "Loading" }: { label?: string } = $props();
</script>

<span role="status" aria-label={label} class="spinner"></span>

<style>
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-fold);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin var(--dur-slow) linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
