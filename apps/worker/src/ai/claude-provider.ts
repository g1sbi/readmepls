import type Anthropic from "@anthropic-ai/sdk";
import { AITagResult } from "@readmepls/types";
import type { AIProvider } from "./provider.js";

const PROMPT =
  'Return ONLY JSON: {"tags": string[] (max 8, lowercase), "summary": string (<=2 sentences)} for the article below.\n\n';

export class ClaudeProvider implements AIProvider {
  constructor(
    private client: Pick<Anthropic, "messages">,
    private model: string
  ) {}

  async tagAndSummarize(text: string): Promise<AITagResult> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: "user", content: PROMPT + text.slice(0, 12000) }],
    });
    const block = msg.content.find((b: any) => b.type === "text");
    const raw = block && "text" in block ? (block.text as string) : "";
    return AITagResult.parse(JSON.parse(raw));
  }
}
