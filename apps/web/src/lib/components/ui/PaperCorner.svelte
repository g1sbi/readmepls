<script lang="ts">
  // Decorative dog-ear fold echoing assets/_banner.html's .fold motif.
  // Purely visual: aria-hidden, no interaction. Host must be position: relative.
  let { size = 48 }: { size?: number } = $props();
</script>

<span class="paper-corner" aria-hidden="true" style="--corner-size: {size}px;"></span>

<style>
  .paper-corner {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--corner-size);
    height: var(--corner-size);
    pointer-events: none;
    background: linear-gradient(225deg, var(--color-fold) 0 50%, transparent 50%);
    border-bottom-left-radius: var(--radius-md);
  }
</style>
