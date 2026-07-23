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
import { LocalEmbedder } from "./embed/local-embedder.js";
import { selectEmbedder } from "./embed/select-embedder.js";
import {
  createSafeFetchHtml,
  createSafeFetchBytes,
  defaultSafeFetchRedirectTarget,
} from "./fetch/safe-fetch.js";
import { runLoopOnce } from "./run-loop.js";
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
import { ResolverRegistry } from "./resolve/registry.js";
import { DailyDevResolver } from "./resolve/daily-dev-resolver.js";
import { HackerNewsResolver } from "./resolve/hacker-news-resolver.js";
import { LobstersResolver } from "./resolve/lobsters-resolver.js";
import type { ResolveIO } from "./resolve/resolver.js";
import type { ProcessDeps } from "./worker.js";
import { backfillSources } from "./source/backfill-sources.js";
import { backfillEmbeddings } from "./embed/backfill-embeddings.js";
import { createSearchServer } from "./http/search-server.js";
import { keepAuthenticated } from "./auth/keep-authenticated.js";

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
    .authWithPassword(
      requireEnv("PB_WORKER_EMAIL"),
      requireEnv("PB_WORKER_PASSWORD"),
    );

  // The superuser token issued above expires (24h by default, server-side
  // setting) and the SDK never renews it — without this, a long-lived worker
  // silently loses the ability to claim jobs once the token lapses.
  const authRefreshMs = Number(process.env.WORKER_AUTH_REFRESH_MS ?? String(60 * 60 * 1000));
  keepAuthenticated(authRefreshMs, {
    refresh: () => pb.collection("_superusers").authRefresh(),
    onError: (err) => console.error(`[worker ${workerId}] auth refresh failed:`, err),
  });

  const fetchHtml = createSafeFetchHtml({
    lookup: async (host) =>
      (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });

  // The Anthropic client is built lazily inside the factory so mock mode
  // (smoke test) needs no ANTHROPIC_API_KEY.
  const ai = selectAiProvider(process.env, () => {
    const anthropic = new Anthropic({
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
    });
    return new ClaudeProvider(anthropic, model);
  });

  const fetchBytes = createSafeFetchBytes({
    lookup: async (host) =>
      (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });

  const fetchJson = async (url: string): Promise<unknown> =>
    JSON.parse(await fetchHtml(url));

  // Lazy, same as the AI provider: EMBED_PROVIDER=fake (used by the offline
  // smoke path) skips loading the local ONNX model entirely.
  const embedder = selectEmbedder(
    process.env,
    () => new LocalEmbedder(process.env.TRANSFORMERS_CACHE),
  );
  const maybeWarmup = (embedder as unknown as { warmup?: () => Promise<void> })
    .warmup;
  if (typeof maybeWarmup === "function") {
    await maybeWarmup.call(embedder);
  }

  const io: ExtractIO & ResolveIO = {
    fetchHtml,
    fetchJson,
    fetchRedirectTarget: defaultSafeFetchRedirectTarget(),
    runYtDlp: defaultRunYtDlp(fetchHtml),
  };

  const registry = new ExtractorRegistry([
    new ArticleExtractor(),
    new XExtractor(),
    new YoutubeExtractor(),
  ]);

  const resolvers = new ResolverRegistry([
    new DailyDevResolver(),
    new HackerNewsResolver(),
    new LobstersResolver(),
  ]);

  const deps: ProcessDeps = {
    io,
    registry,
    resolvers,
    ai,
    classify: classifySource,
    fetchBytes,
    embedder,
  };

  if (process.env.BACKFILL_SOURCES === "1") {
    const { linked } = await backfillSources(pb, { fetchHtml, fetchBytes });
    console.log(
      `[worker ${workerId}] backfilled ${linked} content rows with sources`,
    );
  }

  if (process.env.BACKFILL_EMBEDDINGS === "1") {
    const { indexed } = await backfillEmbeddings(pb, embedder);
    console.log(
      `[worker ${workerId}] backfilled embeddings for ${indexed} content rows`,
    );
  }

  const searchSecret = process.env.WORKER_SEARCH_SECRET ?? "";
  const searchPort = Number(process.env.WORKER_HTTP_PORT ?? "8091");
  // Bind loopback by default so the internal /search endpoint is not exposed on
  // every interface. In Docker, set WORKER_HTTP_HOST=0.0.0.0 so the web container
  // can reach it over the internal network (the port is never published to host).
  const searchHost = process.env.WORKER_HTTP_HOST ?? "127.0.0.1";
  if (searchSecret) {
    const server = createSearchServer({ pb, embedder, secret: searchSecret });
    server.listen(searchPort, searchHost, () =>
      console.log(
        `[worker ${workerId}] /search on ${searchHost}:${searchPort}`,
      ),
    );
  } else {
    console.warn(
      `[worker ${workerId}] WORKER_SEARCH_SECRET unset — semantic /search disabled`,
    );
  }

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
