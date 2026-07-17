<script lang="ts">
  import { GITHUB_URL } from "$lib/site";
</script>

<svelte:head>
  <title>readmepls — privacy policy</title>
  <meta
    name="description"
    content="How readmepls and its browser extension handle your data."
  />
</svelte:head>

<main class="privacy">
  <h1>privacy policy</h1>
  <p class="lede">
    readmepls is a reader-first bookmarking app. This policy explains what data
    the readmepls service and the readmepls browser extension handle, why, and
    where it goes. Short version: we collect only what's needed to sign you in
    and save the pages you choose — nothing more, and we never sell it.
  </p>
  <p class="effective">Last updated: 17 July 2026</p>

  <section>
    <h2>who this covers</h2>
    <p>
      This policy applies to the hosted readmepls service and to the readmepls
      browser extension. If you use a <strong>self-hosted</strong> instance, your
      data is handled by whoever operates that instance, not by us — see
      <a href="#self-hosting">self-hosting</a> below.
    </p>
  </section>

  <section>
    <h2>what we collect</h2>
    <ul>
      <li>
        <strong>Account details</strong> — the email address and password you
        use to create an account and sign in.
      </li>
      <li>
        <strong>Pages you save</strong> — the URL of any page you choose to add
        to your library, plus the readable content extracted from it and any
        highlights, notes, tags, and collections you create.
      </li>
      <li>
        <strong>Basic technical data</strong> — standard request information
        (such as IP address and timestamps) that any web server receives, used
        to operate and secure the service.
      </li>
    </ul>
    <p>
      We do <strong>not</strong> collect health, financial, or payment-card data,
      your personal communications, your location, or your general browsing
      history. We only ever receive the URL of a page when you explicitly save
      it.
    </p>
  </section>

  <section>
    <h2>how we use it</h2>
    <ul>
      <li>To authenticate you and keep you signed in.</li>
      <li>
        To extract, store, and display the pages you save so you can read,
        highlight, search, and organize them.
      </li>
      <li>To operate, secure, and debug the service.</li>
    </ul>
    <p>
      We do not use your data for advertising, we do not sell or rent it to
      anyone, and we never use it to determine creditworthiness or for lending.
    </p>
  </section>

  <section>
    <h2>the browser extension</h2>
    <p>
      The extension saves the page you're currently viewing to your library in
      one click. It handles data narrowly:
    </p>
    <ul>
      <li>
        <strong>The current tab's URL</strong> is read only when you open the
        popup and click <em>Save</em> (the <code>activeTab</code> permission). It
        reads the page URL only — never the page's contents, your other tabs, or
        your browsing history.
      </li>
      <li>
        <strong>Your login session and settings</strong> (an authentication
        token and, for self-hosters, your instance URL) are stored locally in
        the browser via <code>chrome.storage</code> so you don't have to sign in
        on every save. This stays on your device.
      </li>
      <li>
        <strong>Your email and password</strong> are sent, over HTTPS, only to
        your readmepls instance to sign you in.
      </li>
    </ul>
    <p>
      The extension talks only to your readmepls instance. It sends no data to
      any third party, contains no analytics or tracking, and runs no remote
      code — everything it executes ships inside the extension package.
    </p>
  </section>

  <section>
    <h2>who we share it with</h2>
    <p>
      We don't sell your data and we don't share it with third parties for their
      own purposes. Your data may be processed by the infrastructure providers
      that host the service, acting on our behalf solely to run readmepls. AI
      features, when you enable them, send the content of pages you save to the
      configured AI provider only to generate tags and summaries for you.
    </p>
  </section>

  <section>
    <h2>storage &amp; retention</h2>
    <p>
      Your account and saved library are kept for as long as your account
      exists. The extension's locally stored session and settings remain until
      you sign out, clear the extension's storage, or uninstall it. When you
      delete your account, your associated data is removed from the service.
    </p>
  </section>

  <section id="self-hosting">
    <h2>self-hosting</h2>
    <p>
      readmepls is open source and self-hostable. If you run your own instance,
      you (or your operator) control the server, the database, and any AI keys —
      your data lives on your infrastructure and is subject to your operator's
      practices, not ours. The extension can be pointed at a self-hosted
      instance in its options page; when you do, it communicates only with that
      instance.
    </p>
  </section>

  <section>
    <h2>your choices</h2>
    <p>
      You can delete pages, highlights, and collections at any time, sign out of
      the extension, or delete your account to remove your data. For access or
      deletion requests, contact us using the link below.
    </p>
  </section>

  <section>
    <h2>changes to this policy</h2>
    <p>
      If we make material changes, we'll update this page and the date at the
      top. Continued use after a change means you accept the updated policy.
    </p>
  </section>

  <p class="more">
    Questions about privacy? Open an issue on
    <a href={GITHUB_URL}>GitHub</a>.
  </p>
</main>

<style>
  .privacy {
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
    margin-bottom: 0.5rem;
  }
  .effective {
    color: var(--faint);
    font-size: 0.85rem;
    margin-bottom: 2.5rem;
  }
  section {
    margin-bottom: 2.25rem;
    scroll-margin-top: 2rem;
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
  ul {
    color: var(--muted);
    line-height: 1.6;
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  li {
    margin-bottom: 0.4rem;
  }
  a {
    font-weight: 600;
    color: var(--ink);
  }
  a:hover {
    color: var(--accent);
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
</style>
