import { hostname } from "node:os";
import { lookup as dnsLookup } from "node:dns/promises";
import PocketBase from "pocketbase";
import Anthropic from "@anthropic-ai/sdk";
import { classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { XExtractor } from "./extract/x-extractor.js";
import { YoutubeExtractor } from "./extract/youtube-extractor.js";
import { defaultRunYtDlp } from "./extract/yt-dlp.js";
import { ClaudeProvider } from "./ai/claude-provider.js";
import { selectAiProvider } from "./ai/select-provider.js";
import { createSafeFetchHtml } from "./fetch/safe-fetch.js";
import { runLoopOnce } from "./run-loop.js";
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
import type { ProcessDeps } from "./worker.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const pbUrl = process.env.PB_URL ?? "http://pocketbase:8090";
  const pollMs = Number(process.env.WORKER_POLL_MS ?? "2000");
  const model = process.env.AI_MODEL ?? "claude-haiku-4-5";
  const workerId = process.env.WORKER_ID ?? hostname();

  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);
  await pb
    .collection("_superusers")
    .authWithPassword(requireEnv("PB_WORKER_EMAIL"), requireEnv("PB_WORKER_PASSWORD"));

  const fetchHtml = createSafeFetchHtml({
    lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });

  // The Anthropic client is built lazily inside the factory so mock mode
  // (smoke test) needs no ANTHROPIC_API_KEY.
  const ai = selectAiProvider(process.env, () => {
    const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    return new ClaudeProvider(anthropic, model);
  });

  const fetchJson = async (url: string): Promise<unknown> =>
    JSON.parse(await fetchHtml(url));

  const io: ExtractIO = {
    fetchHtml,
    fetchJson,
    runYtDlp: defaultRunYtDlp(fetchHtml),
  };

  const registry = new ExtractorRegistry([
    new ArticleExtractor(),
    new XExtractor(),
    new YoutubeExtractor(),
  ]);

  const deps: ProcessDeps = {
    io,
    registry,
    ai,
    classify: classifySource,
  };

  console.log(`[worker ${workerId}] polling ${pbUrl} every ${pollMs}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const worked = await runLoopOnce(pb, workerId, deps);
      if (!worked) await sleep(pollMs);
    } catch (err) {
      console.error(`[worker ${workerId}] loop error:`, err);
      await sleep(pollMs);
    }
  }
}

main().catch((err) => {
  console.error("worker fatal:", err);
  process.exit(1);
});
