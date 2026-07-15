import type { AIProvider } from "./provider.js";
import { MockAIProvider } from "./mock-provider.js";
import { NullAIProvider } from "./null-provider.js";

/**
 * Pick the AI provider from env. `AI_PROVIDER=mock` wires the deterministic
 * MockAIProvider — used by the self-host smoke test so an end-to-end job can
 * complete offline with no Anthropic key or network spend. With no key and no
 * mock flag (typically a self-hosted deploy with AI turned off), NullAIProvider
 * lets extraction complete with empty tags/summary instead of crashing on the
 * first real capture. Otherwise builds the real provider via the injected
 * factory, a thunk so the Anthropic client (and its required key) is only
 * constructed when actually used.
 */
export function selectAiProvider(
  env: { AI_PROVIDER?: string; ANTHROPIC_API_KEY?: string },
  makeClaude: () => AIProvider
): AIProvider {
  if (env.AI_PROVIDER === "mock") {
    return new MockAIProvider({ tags: ["smoke"], summary: "ok" });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return new NullAIProvider();
  }
  return makeClaude();
}
