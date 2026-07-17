<script lang="ts">
  import { GITHUB_URL } from "$lib/site";
</script>

<footer class="footer">
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href="/docs">Docs</a>
    <a href="/privacy">Privacy</a>
  </nav>
  <p class="meta">open source · self-hostable</p>
</footer>

<style>
  .footer {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem 4rem;
    text-align: center;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    justify-content: center;
  }
  .links a {
    text-decoration: none;
    font-weight: 600;
    color: var(--ink);
  }
  .links a:hover {
    color: var(--accent);
  }
  .meta {
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--faint);
  }
</style>
