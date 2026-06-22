import { hostname } from "node:os";
import { lookup as dnsLookup } from "node:dns/promises";
import PocketBase from "pocketbase";
import Anthropic from "@anthropic-ai/sdk";
import { classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { ClaudeProvider } from "./ai/claude-provider.js";
import { createSafeFetchHtml } from "./fetch/safe-fetch.js";
import { runLoopOnce } from "./run-loop.js";
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

  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const fetchHtml = createSafeFetchHtml({
    lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });

  const deps: ProcessDeps = {
    fetchHtml,
    extractor: new ArticleExtractor(),
    ai: new ClaudeProvider(anthropic, model),
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
