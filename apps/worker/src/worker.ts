import { createHash } from "node:crypto";
import type PocketBase from "pocketbase";
import type { ExtractIO } from "./extract/extractor.js";
import type { ExtractorRegistry } from "./extract/registry.js";
import type { AIProvider } from "./ai/provider.js";
import type { SourceType } from "@readmepls/types";

export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
}

export async function processJob(
  pb: PocketBase,
  jobId: string,
  deps: ProcessDeps
): Promise<void> {
  const job = await pb.collection("jobs").getOne(jobId);
  try {
    const source = deps.classify(job.canonical_url);
    const extractor = deps.registry.for(source);
    const result = await extractor.extract(job.canonical_url, deps.io);

    if (result.status === "failed") {
      await pb.collection("jobs").update(jobId, {
        status: "failed",
        attempts: job.attempts + 1,
        last_error: result.failureReason ?? "extract failed",
      });
      return;
    }

    const ai = await deps.ai.tagAndSummarize(result.contentText);
    const content = await pb.collection("content").create({
      canonical_url: job.canonical_url,
      content_hash: createHash("sha256").update(result.contentText).digest("hex"),
      source_type: result.sourceType,
      title: result.title,
      author: result.author,
      site_name: result.siteName,
      lang: result.lang,
      excerpt: ai.summary || result.excerpt,
      content_html: result.contentHtml,
      content_text: result.contentText,
      word_count: result.wordCount,
      read_time: result.readTime,
      hero_image: result.heroImage,
      published_at: result.publishedAt,
      ai_tags_json: ai.tags,
      fetched_at: new Date().toISOString(),
      extract_status: result.status,
      failure_reason: result.failureReason,
    });

    // Link every content-less article that captured this URL to the freshly
    // extracted content. Public extractions are shared, so these become readable.
    const toLink = await pb.collection("articles").getFullList({
      filter: pb.filter("canonical_url = {:url} && content = ''", {
        url: job.canonical_url,
      }),
    });
    for (const a of toLink) {
      await pb.collection("articles").update(a.id, {
        content: content.id,
        is_private: false,
      });
    }

    await pb.collection("jobs").update(jobId, {
      status: "done",
      content: content.id,
    });
  } catch (err) {
    // PocketBase validation failures carry field-level detail on
    // err.response.data; err.message alone ("Failed to create record.") hides
    // which field was rejected. Surface the full payload so a stuck job can be
    // diagnosed from last_error without re-running the worker.
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    const detail = data ? ` ${JSON.stringify(data)}` : "";
    const msg = (err instanceof Error ? err.message : String(err)) + detail;
    await pb.collection("jobs").update(jobId, {
      status: "failed",
      attempts: job.attempts + 1,
      last_error: msg,
    });
  }
}
