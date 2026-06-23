import { createHash } from "node:crypto";
import type PocketBase from "pocketbase";
import type { Extractor } from "./extract/extractor.js";
import type { AIProvider } from "./ai/provider.js";
import type { SourceType } from "@readmepls/types";

export interface ProcessDeps {
  fetchHtml: (url: string) => Promise<string>;
  extractor: Extractor;
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
    const html = await deps.fetchHtml(job.canonical_url);
    const result = deps.extractor.extract(job.canonical_url, html);

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
      ai_tags_json: ai.tags,
      fetched_at: new Date().toISOString(),
      extract_status: result.status,
      failure_reason: null,
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
    await pb.collection("jobs").update(jobId, {
      status: "failed",
      attempts: job.attempts + 1,
      last_error: err instanceof Error ? err.message : String(err),
    });
  }
}
