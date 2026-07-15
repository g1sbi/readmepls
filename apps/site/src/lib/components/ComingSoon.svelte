<script lang="ts">
  import { PRO_STRIP } from "$lib/site";
  import { reveal } from "$lib/actions/reveal";
</script>

<section class="pro" use:reveal>
  <span class="badge">{PRO_STRIP.badge}</span>
  <p class="body">{PRO_STRIP.body}</p>
</section>

<style>
  /* Lighter, dashed band so it clearly reads as "not yet / extra", not core. */
  .pro {
    position: relative;
    z-index: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 2.5rem 1.75rem;
    text-align: center;
    border: 1.5px dashed var(--fold);
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface-1) 55%, transparent);
  }
  .badge {
    display: inline-block;
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.75rem;
  }
  .body {
    color: var(--muted);
    font-size: 1.05rem;
    line-height: 1.5;
  }
</style>
