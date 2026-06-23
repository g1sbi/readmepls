<script lang="ts">
  let { label = "Loading" }: { label?: string } = $props();
</script>

<span role="status" aria-label={label} class="spinner"></span>

<style>
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--fold);
    border-top-color: var(--accent);
    border-radius: 50%;
  }
</style>
