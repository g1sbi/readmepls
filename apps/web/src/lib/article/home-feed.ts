import { deriveCardState } from "./card-state.js";

type WithContent = { expand?: { content?: unknown } };

/** Split a -created-sorted article list for the extractor home:
 *  every in-flight/failed item is surfaced; a few recent ready ones give context. */
export function splitHomeFeed<T extends WithContent>(
  articles: T[],
  recentLimit = 6,
): { active: T[]; recent: T[] } {
  const active: T[] = [];
  const recent: T[] = [];
  for (const a of articles) {
    const state = deriveCardState((a.expand?.content ?? null) as Parameters<typeof deriveCardState>[0]);
    if (state === "ready") {
      if (recent.length < recentLimit) recent.push(a);
    } else {
      active.push(a);
    }
  }
  return { active, recent };
}
