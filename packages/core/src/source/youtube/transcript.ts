import type { ExtractResult } from "@readmepls/types";
import { escapeHtml } from "../extract-result.js";

const WORDS_PER_MIN = 220;
const CUES_PER_PARAGRAPH = 5;

export interface YtMeta {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  description: string | null;
}

export interface YtCue {
  startSec: number;
  text: string;
}

export interface YtCaptions {
  cues: YtCue[];
}

export interface YtDlpOutput {
  meta: YtMeta;
  captions: YtCaptions | null;
}

/** Parse YouTube json3 caption text into timestamped cues. */
export function parseJson3Captions(text: string): YtCaptions | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;

  const cues: YtCue[] = [];
  for (const e of events) {
    const segs = (e as { segs?: unknown }).segs;
    if (!Array.isArray(segs)) continue;
    const joined = segs
      .map((s) => (s as { utf8?: string }).utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!joined) continue;
    const startSec = Math.floor(((e as { tStartMs?: number }).tStartMs ?? 0) / 1000);
    cues.push({ startSec, text: joined });
  }
  return cues.length ? { cues } : null;
}

function stamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `[${m}:${String(s).padStart(2, "0")}]`;
}

/** Fold metadata + captions into a readable result; partial when no captions. */
export function parseYtTranscript(
  meta: YtMeta,
  captions: YtCaptions | null
): ExtractResult {
  const base = {
    sourceType: "youtube" as const,
    title: meta.title,
    author: meta.channel,
    siteName: "YouTube",
    lang: null,
    heroImage: meta.thumbnail,
  };

  if (!captions || captions.cues.length === 0) {
    const text = meta.description ?? "";
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return {
      ...base,
      status: "partial",
      contentHtml: text ? `<p>${escapeHtml(text)}</p>` : "",
      contentText: text,
      excerpt: text.slice(0, 280),
      wordCount,
      readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
      failureReason: "no transcript",
    };
  }

  const paragraphs: { start: number; text: string }[] = [];
  for (let i = 0; i < captions.cues.length; i += CUES_PER_PARAGRAPH) {
    const group = captions.cues.slice(i, i + CUES_PER_PARAGRAPH);
    paragraphs.push({
      start: group[0]!.startSec,
      text: group.map((c) => c.text).join(" "),
    });
  }

  const contentHtml = paragraphs
    .map((p) => `<p>${stamp(p.start)} ${escapeHtml(p.text)}</p>`)
    .join("\n");
  const contentText = paragraphs.map((p) => `${stamp(p.start)} ${p.text}`).join("\n\n");
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;

  return {
    ...base,
    status: "ok",
    contentHtml,
    contentText,
    excerpt: (meta.description ?? contentText).slice(0, 280),
    wordCount,
    readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
    failureReason: null,
  };
}
