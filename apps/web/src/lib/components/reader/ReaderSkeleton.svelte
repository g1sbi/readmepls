<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";

  // Shaped like the real page so nothing jumps when the article arrives: the
  // source pill, a two-line title, the meta line, then paragraphs.
  const paragraphs = [
    [100, 97, 94, 100, 62],
    [100, 97, 94, 100, 97, 40],
    [100, 97, 94, 75],
  ];
</script>

<div class="skeleton" aria-busy="true" aria-label="Loading article">
  <Skeleton class="mb-4 h-5 w-24 rounded-full" />
  <Skeleton class="mb-2.5 h-[var(--reading-h1)] w-[92%]" />
  <Skeleton class="mb-5 h-[var(--reading-h1)] w-[55%]" />
  <div class="meta">
    <Skeleton class="h-3.5 w-20" />
    <Skeleton class="h-3.5 w-20" />
  </div>
  {#each paragraphs as widths, p (p)}
    <div class="para">
      {#each widths as w, i (i)}
        <Skeleton class="h-[0.9em]" style={`width:${w}%`} />
      {/each}
    </div>
  {/each}
</div>

<style>
  .skeleton {
    max-width: var(--reading-measure);
    margin: 0 auto;
  }
  .meta {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }
  .para {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
    margin-bottom: 1em;
  }
</style>
