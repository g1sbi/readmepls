import type { AIProvider } from "./provider.js";
import { MockAIProvider } from "./mock-provider.js";

/**
 * Pick the AI provider from env. `AI_PROVIDER=mock` wires the deterministic
 * MockAIProvider — used by the self-host smoke test so an end-to-end job can
 * complete offline with no Anthropic key or network spend. Any other value
 * (the default) builds the real provider via the injected factory, which is a
 * thunk so the Anthropic client (and its required API key) is only constructed
 * when actually used.
 */
export function selectAiProvider(
  env: { AI_PROVIDER?: string },
  makeClaude: () => AIProvider
): AIProvider {
  if (env.AI_PROVIDER === "mock") {
    return new MockAIProvider({ tags: ["smoke"], summary: "ok" });
  }
  return makeClaude();
}
