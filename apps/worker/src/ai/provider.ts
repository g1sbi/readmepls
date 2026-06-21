import type { AITagResult } from "@readmepls/types";

export interface AIProvider {
  tagAndSummarize(text: string): Promise<AITagResult>;
}
