import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { parseJson3Captions } from "@readmepls/core";
import type { YtDlpOutput, YtMeta } from "@readmepls/core";

const execFileAsync = promisify(execFile);

export interface RunYtDlpDeps {
  /** Run yt-dlp with args, resolve its stdout. */
  exec(args: string[]): Promise<string>;
  /** Fetch a caption-track URL as text (SSRF-guarded in production). */
  fetchText(url: string): Promise<string>;
  /**
   * Path to a Netscape-format cookies file. YouTube bot-blocks datacenter IPs
   * ("Sign in to confirm you're not a bot"); passing authenticated cookies gets
   * past it. Optional — omitted when running from an unblocked IP.
   */
  cookiesFile?: string | null;
}

// Permissive schema for the subset of yt-dlp `-j` output this adapter reads.
// .passthrough() preserves any extra fields yt-dlp adds without failing.
const CaptionTrack = z.object({
  ext: z.string().optional(),
  url: z.string().optional(),
});

const YtDlpJsonSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    channel: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    automatic_captions: z.record(z.array(CaptionTrack)).optional(),
    subtitles: z.record(z.array(CaptionTrack)).optional(),
  })
  .passthrough();

type YtDlpJson = z.infer<typeof YtDlpJsonSchema>;

type CaptionMap = Record<string, z.infer<typeof CaptionTrack>[]>;

// Pick an English json3 track from a caption map. YouTube keys English tracks
// several ways — exact `en`, `en-orig`, `en-US`, or uploader-scoped ids like
// `en-nP7-2PuUl7o` — so match `en` and any `en-*` variant, preferring the exact
// `en`/`en-orig` originals over regional/translated variants.
function pickEnJson3Url(map: CaptionMap | undefined): string | null {
  if (!map) return null;
  const keys = Object.keys(map);
  const ordered = [
    ...keys.filter((k) => k === "en" || k === "en-orig"),
    ...keys.filter((k) => k !== "en" && k !== "en-orig" && k.startsWith("en-")),
  ];
  for (const key of ordered) {
    const url = map[key]?.find((t) => t.ext === "json3")?.url;
    if (url) return url;
  }
  return null;
}

function pickJson3Url(meta: YtDlpJson): string | null {
  return pickEnJson3Url(meta.subtitles) ?? pickEnJson3Url(meta.automatic_captions) ?? null;
}

/** Build a runYtDlp seam from injected exec + fetch. */
export function createRunYtDlp(
  deps: RunYtDlpDeps
): (videoId: string) => Promise<YtDlpOutput> {
  return async function runYtDlp(videoId: string): Promise<YtDlpOutput> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = ["-j", "--skip-download"];
    if (deps.cookiesFile) args.push("--cookies", deps.cookiesFile);
    args.push(url);
    const raw = await deps.exec(args);
    // Validate at the IO boundary — malformed yt-dlp output throws here,
    // which the caller's try/catch converts to a graceful failedResult.
    const json = YtDlpJsonSchema.parse(JSON.parse(raw));

    const meta: YtMeta = {
      videoId,
      title: json.title ?? videoId,
      channel: json.channel ?? null,
      thumbnail: json.thumbnail ?? null,
      description: json.description ?? null,
    };

    const trackUrl = pickJson3Url(json);
    const captions = trackUrl ? parseJson3Captions(await deps.fetchText(trackUrl)) : null;
    return { meta, captions };
  };
}

/** Production wiring: real yt-dlp binary. Thin IO adapter (untested seam). */
export function defaultRunYtDlp(
  fetchText: (url: string) => Promise<string>
): (videoId: string) => Promise<YtDlpOutput> {
  return createRunYtDlp({
    // Optional cookies file to defeat YouTube's datacenter-IP bot-block. Empty
    // string (unset env) is treated as "no cookies".
    cookiesFile: process.env.YOUTUBE_COOKIES_FILE || null,
    exec: async (args) => {
      try {
        const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 32 * 1024 * 1024 });
        return stdout;
      } catch (err) {
        // execFile rejects on non-zero exit with the real reason on `.stderr`
        // (e.g. "Sign in to confirm you're not a bot"), while `.message` is only
        // "Command failed: …". Surface the ERROR line so it reaches failure_reason.
        const e = err as { stderr?: string; message?: string };
        const stderr = (e.stderr ?? "").trim();
        const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
        const reason = [...lines].reverse().find((l) => l.startsWith("ERROR")) ?? lines.at(-1);
        throw new Error(reason || e.message || "yt-dlp exec failed");
      }
    },
    fetchText,
  });
}
