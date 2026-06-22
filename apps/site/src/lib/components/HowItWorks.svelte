<script lang="ts">
  import { STEPS } from "$lib/site";
  import { reveal } from "$lib/actions/reveal";
</script>

<section class="how">
  <h2 use:reveal>How it works</h2>
  <ol class="steps">
    {#each STEPS as step, i (step.n)}
      <li class="step" use:reveal={{ delay: 80 + i * 110 }}>
        <span class="num">{step.n}</span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </li>
    {/each}
  </ol>
</section>

<style>
  .how {
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
  .steps {
    list-style: none;
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .num {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--surface-0);
    font-weight: 600;
    font-size: 1.25rem;
  }
  h3 {
    font-weight: 600;
    font-size: 1.2rem;
  }
  p {
    color: var(--muted);
    max-width: 26ch;
  }
</style>
