<script lang="ts">
  import { APP_URL, GITHUB_URL, TAGLINE } from "$lib/site";
</script>

<section class="hero">
  <div class="fold" aria-hidden="true"></div>
  <img class="logo" src="/hero.png" alt="readmepls logo" width="160" height="160" />
  <h1 class="wordmark">readme<span class="pls">pls</span></h1>
  <p class="tagline">{TAGLINE}</p>
  <div class="cta">
    <a class="btn primary" href={APP_URL}>Open app</a>
    <a class="btn ghost" href={GITHUB_URL}>GitHub</a>
  </div>
</section>

<style>
  .hero {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1.25rem;
    padding: clamp(4rem, 12vh, 9rem) 1.5rem 3rem;
  }
  .fold {
    position: absolute;
    top: -1rem;
    right: -1rem;
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, var(--fold) 0%, var(--fold) 50%, transparent 50%);
    opacity: 0.55;
    border-bottom-left-radius: 28px;
  }
  .logo {
    border-radius: 32px;
    transform: rotate(-4deg);
    filter: drop-shadow(0 18px 28px rgba(54, 44, 22, 0.28));
  }
  .wordmark {
    font-weight: 600;
    font-size: clamp(3.5rem, 12vw, 7rem);
    line-height: 0.9;
    letter-spacing: -0.04em;
  }
  .pls {
    color: var(--accent);
  }
  .tagline {
    font-weight: 500;
    font-size: clamp(1.1rem, 3.5vw, 1.6rem);
    color: var(--muted);
  }
  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .btn {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.05rem;
    padding: 0.7rem 1.5rem;
    border-radius: 999px;
    transition: transform 0.12s ease;
  }
  .btn:hover {
    transform: translateY(-2px);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--surface-0);
    box-shadow: 0 10px 20px rgba(194, 74, 56, 0.28);
  }
  .btn.ghost {
    color: var(--ink);
    border: 2px solid var(--fold);
  }
</style>
