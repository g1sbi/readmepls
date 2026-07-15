import { env } from "$env/dynamic/public";

// Single source of truth for outward-facing links and marketing copy.
// APP_URL is the absolute origin of the reader app (a relative link can't cross
// origins). Operators set PUBLIC_APP_URL; the Docker build bakes the sentinel
// __APP_URL__, which the container entrypoint rewrites to $APP_URL at start.
// Fallback covers local `vite dev` with no env set (web's default dev port).
export const APP_URL = env.PUBLIC_APP_URL || "http://localhost:3000";

// Change GITHUB_URL here if the repo slug differs.
export const GITHUB_URL = "https://github.com/readmepls/readmepls";
export const TAGLINE = "save any link. actually read it. pls.";

export type Step = { n: string; title: string; body: string };
export type Feature = { title: string; body: string };

export const STEPS: readonly Step[] = [
  {
    n: "1",
    title: "Paste a link",
    body: "Drop any article, thread, or video URL.",
  },
  {
    n: "2",
    title: "Extract & auto-tag",
    body: "We pull the readable content and tag it with AI.",
  },
  {
    n: "3",
    title: "Read with highlights",
    body: "A clean reader with highlights, notes, and search.",
  },
];

export const FEATURES: readonly Feature[] = [
  {
    title: "Reader view",
    body: "Distraction-free typography, tuned your way.",
  },
  {
    title: "Highlights & notes",
    body: "Mark up anything; it stays anchored to the text.",
  },
  {
    title: "AI auto-tags",
    body: "Every save organized without lifting a finger.",
  },
  { title: "Search & collections", body: "Find and group everything, fast." },
];
