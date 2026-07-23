import { z } from "zod";
import {
  httpUrlOrNull,
  type LinkResolver,
  type ResolveIO,
} from "./resolver.js";

// Only the field we need. Firebase returns `null` for deleted/missing items,
// and Ask/Show HN text posts simply omit `url`.
const Item = z.object({ url: z.string().optional() });

export class HackerNewsResolver implements LinkResolver {
  readonly hosts = ["news.ycombinator.com"] as const;

  async resolve(url: string, io: ResolveIO): Promise<string | null> {
    const u = new URL(url);
    if (u.pathname !== "/item") return null;

    const id = u.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return null;

    const json = await io.fetchJson(
      `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
    );
    const parsed = Item.safeParse(json);
    if (!parsed.success) return null;

    return httpUrlOrNull(parsed.data.url);
  }
}
