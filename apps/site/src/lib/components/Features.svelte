<script lang="ts">
  import { FEATURES } from "$lib/site";
</script>

<section class="features">
  <h2>What you get</h2>
  <div class="grid">
    {#each FEATURES as feature (feature.title)}
      <article class="card">
        <h3>{feature.title}</h3>
        <p>{feature.body}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .features {
    position: relative;
    z-index: 1;
    max-width: 980px;
    margin: 0 auto;
    padding: 3rem 1.5rem;
    text-align: center;
  }
  h2 {
    font-weight: 600;
    font-size: clamp(1.8rem, 5vw, 2.5rem);
    letter-spacing: -0.02em;
    margin-bottom: 2rem;
  }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .card {
    text-align: left;
    padding: 1.5rem;
    border-radius: 20px;
    background: var(--surface-0);
    border: 1px solid var(--fold);
    box-shadow: 0 8px 18px rgba(54, 44, 22, 0.08);
  }
  h3 {
    font-weight: 600;
    font-size: 1.2rem;
    margin-bottom: 0.4rem;
  }
  p {
    color: var(--muted);
  }
</style>
