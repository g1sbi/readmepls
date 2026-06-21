import type { AITagResult } from "@readmepls/types";
import type { AIProvider } from "./provider.js";

export class MockAIProvider implements AIProvider {
  constructor(private result: AITagResult = { tags: ["test"], summary: "mock" }) {}
  async tagAndSummarize(): Promise<AITagResult> {
    return this.result;
  }
}
