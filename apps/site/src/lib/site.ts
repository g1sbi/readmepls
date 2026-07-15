import { env } from "$env/dynamic/public";

// Single source of truth for outward-facing links and marketing copy.
// APP_URL is the absolute origin of the reader app (a relative link can't cross
// origins). Operators set PUBLIC_APP_URL; the Docker build bakes the sentinel
// __APP_URL__, which the container entrypoint rewrites to $APP_URL at start.
// Fallback covers local `vite dev` with no env set (web's default dev port).
export const APP_URL = env.PUBLIC_APP_URL || "http://localhost:3000";

export const GITHUB_URL = "https://github.com/g1sbi/readmepls";

// Hero line 2. The reel (Hero.svelte) renders line 1: "save any <reel>".
export const TAGLINE = "actually read it. pls.";

// Slot-machine reel words shown after "save any", in display order.
// NOTE: the `reel` keyframes in Hero.svelte are hand-tuned to this exact count
// (5 words). If you add or remove a word, update those keyframes too.
export const REEL_WORDS: readonly string[] = [
  "link",
  "article",
  "video",
  "thread",
  "newsletter",
];

export type Step = { n: string; title: string; body: string };
export type Feature = { title: string; body: string };
export type ProStrip = { badge: string; body: string };

export const STEPS: readonly Step[] = [
  { n: "1", title: "Paste a link", body: "Any article, video, or thread." },
  {
    n: "2",
    title: "We extract the content and store it in readable form",
    body: "Blog post, article, YouTube video — you name it.",
  },
  {
    n: "3",
    title: "Read, highlight, organize",
    body: "Everything you need to read, highlight, annotate, search, and collect.",
  },
];

export const FEATURES: readonly Feature[] = [
  {
    title: "A reader you'll actually use",
    body: "Clean, intuitive and helpful.",
  },
  {
    title: "Highlights & notes",
    body: "Everything important at a glance",
  },
  { title: "Search & collections", body: "Find, group and organize your collections." },
  {
    title: "Yours to host",
    body: "For the privacy nerds out there.",
  },
];

// The "coming soon" band below the free core. AI is a Pro extension — never
// part of the free experience.
export const PRO_STRIP: ProStrip = {
  badge: "Coming soon · Pro",
  body: "AI auto-tags, summaries, reading recommendations and more. Built on top of the reader you already have — no gatekeeping core features.",
};
