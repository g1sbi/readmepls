<script lang="ts">
  import type { PageData } from "./$types";
  import CodeBlock from "$lib/components/CodeBlock.svelte";
  import { GITHUB_URL, EXTENSION_URL } from "$lib/site";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>readmepls — docs</title>
</svelte:head>

<main class="docs">
  <h1>self-hosting</h1>
  <p class="lede">
    run your own copy on your own box. no clone needed — grab two files, fill
    in a few secrets, and you're reading.
  </p>

  <section>
    <h2>1. prerequisites</h2>
    <p>Docker and Docker Compose. That's it.</p>
  </section>

  <section>
    <h2>2. copy compose.yml</h2>
    <p>Save this as <code>compose.yml</code> in a new directory:</p>
    <CodeBlock code={data.compose} />
  </section>

  <section>
    <h2>3. copy .env.example → .env</h2>
    <p>
      Save this as <code>.env</code> next to it, then fill in the PocketBase
      admin/worker passwords.
    </p>
    <CodeBlock code={data.envExample} />
  </section>

  <section>
    <h2>4. pull and run</h2>
    <CodeBlock code={"docker compose pull\ndocker compose up -d"} />
    <p>
      Open <code>http://localhost:3000</code> (or whatever <code>WEB_PORT</code>
      you set).
    </p>
  </section>

  <section>
    <h2>5. updating</h2>
    <p>Same command as above — pulls the latest images and restarts:</p>
    <CodeBlock code={"docker compose pull\ndocker compose up -d"} />
  </section>

  <section>
    <h2>6. data</h2>
    <p>
      Everything lives in the <code>pb_data</code> Docker volume. Back that up,
      back up everything that matters.
    </p>
  </section>

  <section>
    <h2>7. AI features: on or off</h2>
    <p>
      Self-hosting has no tiers, no plans, no subscriptions — that's a
      hosted-SaaS thing. The reader is fully functional with nothing set. Add
      an <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and AI features
      (auto-tagging and friends) switch on for everyone using your instance.
      One switch, not a choice between plans.
    </p>
  </section>

  <section>
    <h2>8. browser extension</h2>
    <p>
      Save the page you're on to your library in one click with the readmepls
      extension — <a href={EXTENSION_URL}>get it on the Chrome Web Store</a>.
      Point it at your instance from its options screen.
    </p>
    <p>
      For it to reach a self-hosted instance, add its origin to
      <code>EXTENSION_ORIGINS</code> in your <code>.env</code> (comma-separated),
      then restart:
    </p>
    <CodeBlock
      code={"EXTENSION_ORIGINS=chrome-extension://cjnlkadkjleamnkjehbnblnblcappaje"}
    />
  </section>

  <p class="more">
    Questions or something looks off? Open an issue on
    <a href={GITHUB_URL}>GitHub</a>.
  </p>
</main>

<style>
  .docs {
    position: relative;
    z-index: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  h1 {
    font-weight: 600;
    font-size: clamp(2rem, 7vw, 3rem);
    letter-spacing: -0.02em;
    margin-bottom: 0.75rem;
  }
  .lede {
    color: var(--muted);
    font-size: 1.1rem;
    margin-bottom: 2.5rem;
  }
  section {
    margin-bottom: 2.25rem;
  }
  h2 {
    font-weight: 600;
    font-size: 1.3rem;
    margin-bottom: 0.6rem;
  }
  p {
    color: var(--muted);
    line-height: 1.6;
  }
  code {
    font-family: "Fira Code", "SFMono-Regular", Consolas, monospace;
    font-size: 0.9em;
    background: var(--surface-1);
    border-radius: 4px;
    padding: 0.1em 0.35em;
    color: var(--ink);
  }
  .more {
    margin-top: 3rem;
  }
  .more a {
    font-weight: 600;
    color: var(--ink);
  }
  .more a:hover {
    color: var(--accent);
  }
</style>
