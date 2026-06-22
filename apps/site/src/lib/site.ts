// Single source of truth for outward-facing links and marketing copy.
// Change GITHUB_URL here if the repo slug differs.
export const APP_URL = "https://app.readmepls.com";
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
