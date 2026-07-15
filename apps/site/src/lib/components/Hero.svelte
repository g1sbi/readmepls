<script lang="ts">
  import { APP_URL, GITHUB_URL, TAGLINE, REEL_WORDS } from "$lib/site";

  // Visual reel slots: the first word is duplicated at the top so the downward
  // scroll loops seamlessly; the remaining words are reversed because a higher
  // DOM word enters the downward-moving window later. Order/count is locked to
  // the `reel` keyframes below (5 words).
  const slots = [REEL_WORDS[0], ...[...REEL_WORDS].reverse()];

  // One clean sentence for screen readers, in place of the churning reel.
  const srPhrase = `save any ${REEL_WORDS.slice(0, -1).join(", ")}, or ${REEL_WORDS[REEL_WORDS.length - 1]}`;
</script>

<section class="hero">
  <div class="fold" aria-hidden="true"></div>
  <div class="logo-wrap">
    <img class="logo" src="/hero.png" alt="readmepls" width="160" height="160" />
  </div>
  <h1 class="wordmark">readme<span class="pls">pls</span></h1>
  <p class="tagline reel-line">
    <span class="reel-lead" aria-hidden="true">save any&nbsp;</span><span class="reel" aria-hidden="true"><span class="reel-col">{#each slots as w}<span class="reel-word">{w}</span>{/each}</span></span>
    <span class="sr-only">{srPhrase}</span>
  </p>
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

  /* dog-ear corner peels open on load */
  .fold {
    position: absolute;
    top: -1rem;
    right: -1rem;
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, var(--fold) 0%, var(--fold) 50%, transparent 50%);
    opacity: 0.55;
    border-bottom-left-radius: 28px;
    transform-origin: top right;
    animation: peel 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  }

  .logo-wrap {
    animation: drop-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .logo {
    display: block;
    border-radius: 32px;
    transform: rotate(-4deg);
    filter: drop-shadow(0 18px 28px rgba(54, 44, 22, 0.28));
    transition: transform 0.2s ease;
  }
  /* paper flutter on hover */
  .logo-wrap:hover .logo {
    animation: flutter 0.5s ease;
  }

  .wordmark {
    font-weight: 600;
    font-size: clamp(3.5rem, 12vw, 7rem);
    line-height: 0.9;
    letter-spacing: -0.04em;
    animation: rise 0.6s ease 0.15s both;
  }
  .pls {
    color: var(--accent);
  }
  .tagline {
    font-weight: 500;
    font-size: clamp(1.1rem, 3.5vw, 1.6rem);
    color: var(--muted);
    animation: rise 0.6s ease 0.28s both;
  }

  /* Slot-machine reel: a one-line window; the column steps downward, holding on
     each word. ponytail: baseline of an overflow-hidden inline-block can sit a
     hair low — nudge vertical-align if it looks off when running. */
  .reel-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
  }
  .reel {
    --reel-h: 1.2em;
    display: inline-block;
    height: var(--reel-h);
    line-height: var(--reel-h);
    overflow: hidden;
    vertical-align: bottom;
    text-align: left;
  }
  .reel-col {
    display: flex;
    flex-direction: column;
    animation: reel 11s cubic-bezier(0.7, 0, 0.3, 1) infinite;
  }
  .reel-word {
    height: var(--reel-h);
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 0.5rem;
    animation: rise 0.6s ease 0.4s both;
  }

  .btn {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.05rem;
    padding: 0.7rem 1.5rem;
    border-radius: 999px;
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.18s ease;
  }
  .btn:hover {
    transform: translateY(-3px) scale(1.03);
  }
  .btn:active {
    transform: translateY(-1px) scale(0.98);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--surface-0);
    box-shadow: 0 10px 20px rgba(194, 74, 56, 0.28);
  }
  .btn.primary:hover {
    box-shadow: 0 16px 28px rgba(194, 74, 56, 0.34);
  }
  .btn.ghost {
    color: var(--ink);
    border: 2px solid var(--fold);
  }

  @keyframes reel {
    0%, 14% { transform: translateY(calc(var(--reel-h) * -5)); }
    20%, 34% { transform: translateY(calc(var(--reel-h) * -4)); }
    40%, 54% { transform: translateY(calc(var(--reel-h) * -3)); }
    60%, 74% { transform: translateY(calc(var(--reel-h) * -2)); }
    80%, 94% { transform: translateY(calc(var(--reel-h) * -1)); }
    100% { transform: translateY(0); }
  }
  @keyframes drop-in {
    0% {
      opacity: 0;
      transform: translateY(-30px) scale(0.85);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes rise {
    0% {
      opacity: 0;
      transform: translateY(18px);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes peel {
    0% {
      opacity: 0;
      transform: scale(0.2) rotate(-35deg);
    }
    100% {
      opacity: 0.55;
      transform: none;
    }
  }
  @keyframes flutter {
    0%,
    100% {
      transform: rotate(-4deg);
    }
    25% {
      transform: rotate(2deg);
    }
    50% {
      transform: rotate(-7deg);
    }
    75% {
      transform: rotate(1deg);
    }
  }
</style>
