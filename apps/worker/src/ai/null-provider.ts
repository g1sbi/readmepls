import type { AITagResult } from "@readmepls/types";
import type { AIProvider } from "./provider.js";

/** Used when no AI provider is configured (self-hosted, no key). Returning an
 *  empty result — not throwing — lets extraction complete normally; the
 *  article just has no AI tags/summary, same as if a human hadn't tagged it. */
export class NullAIProvider implements AIProvider {
  async tagAndSummarize(text: string): Promise<AITagResult> {
    return { tags: [], summary: "" };
  }
}
