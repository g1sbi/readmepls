<script lang="ts">
  import { GITHUB_URL } from "$lib/site";
</script>

<header class="nav">
  <a class="wordmark" href="/">readme<span class="pls">pls</span></a>
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href="/docs">Docs</a>
  </nav>
</header>

<style>
  .nav {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 1.25rem 1.5rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  .wordmark {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.25rem;
    color: var(--ink);
  }
  .pls {
    color: var(--accent);
  }
  .links {
    display: flex;
    gap: 1.25rem;
  }
  .links a {
    text-decoration: none;
    font-weight: 600;
    color: var(--ink);
    padding: 0.5rem 0;
  }
  .links a:hover {
    color: var(--accent);
  }
</style>
