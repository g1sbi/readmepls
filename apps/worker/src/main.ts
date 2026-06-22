import Anthropic from "@anthropic-ai/sdk";
import { makeClient, authAsSuperuser, classifySource } from "@readmepls/core";
import { defaultSafeFetchHtml } from "./fetch/safe-fetch.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { ClaudeProvider } from "./ai/claude-provider.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import type { AIProvider } from "./ai/provider.js";
import { runWorkerOnce } from "./run.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveProvider(): AIProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[worker] ANTHROPIC_API_KEY unset — using MockAIProvider");
    return new MockAIProvider();
  }
  const model = process.env.AI_MODEL ?? "claude-haiku-4-5";
  return new ClaudeProvider(new Anthropic({ apiKey: key }), model);
}

async function main(): Promise<void> {
  const pb = makeClient(process.env.PB_URL ?? "http://127.0.0.1:8090");
  await authAsSuperuser(
    pb,
    process.env.PB_ADMIN_EMAIL ?? "worker@local",
    process.env.PB_ADMIN_PASSWORD ?? ""
  );

  const workerId = `worker-${process.pid}`;
  const deps = {
    fetchHtml: defaultSafeFetchHtml(),
    extractor: new ArticleExtractor(),
    ai: resolveProvider(),
    classify: classifySource,
  };

  console.log(`[worker] ${workerId} polling ${pb.baseUrl}`);
  for (;;) {
    let did = false;
    try {
      did = await runWorkerOnce(pb, workerId, deps);
    } catch (err) {
      console.error("[worker] loop error:", err);
    }
    if (!did) await sleep(2000);
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
