import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseJson3Captions } from "@readmepls/core";
import type { YtDlpOutput, YtMeta } from "@readmepls/core";

const execFileAsync = promisify(execFile);

export interface RunYtDlpDeps {
  /** Run yt-dlp with args, resolve its stdout. */
  exec(args: string[]): Promise<string>;
  /** Fetch a caption-track URL as text (SSRF-guarded in production). */
  fetchText(url: string): Promise<string>;
}

interface YtDlpJson {
  id?: string;
  title?: string;
  channel?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  automatic_captions?: Record<string, { ext?: string; url?: string }[]>;
  subtitles?: Record<string, { ext?: string; url?: string }[]>;
}

function pickJson3Url(meta: YtDlpJson): string | null {
  const manual = meta.subtitles?.en?.find((t) => t.ext === "json3")?.url;
  const auto = meta.automatic_captions?.en?.find((t) => t.ext === "json3")?.url;
  return manual ?? auto ?? null;
}

/** Build a runYtDlp seam from injected exec + fetch. */
export function createRunYtDlp(
  deps: RunYtDlpDeps
): (videoId: string) => Promise<YtDlpOutput> {
  return async function runYtDlp(videoId: string): Promise<YtDlpOutput> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const raw = await deps.exec(["-j", "--skip-download", url]);
    const json = JSON.parse(raw) as YtDlpJson;

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
    exec: async (args) => {
      const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    },
    fetchText,
  });
}
