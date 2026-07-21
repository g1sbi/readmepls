import { z } from "zod";
import {
  httpUrlOrNull,
  type LinkResolver,
  type ResolveIO,
} from "./resolver.js";

// Text-only submissions send "" rather than omitting the field, so the
// emptiness check belongs in httpUrlOrNull, not in a .url() refinement here —
// a refinement would fail the whole parse and blur "text post" into "malformed".
const Story = z.object({ url: z.string().optional() });

const STORY_PATH = /^\/s\/([A-Za-z0-9]+)/;

export class LobstersResolver implements LinkResolver {
  readonly hosts = ["lobste.rs"] as const;

  async resolve(url: string, io: ResolveIO): Promise<string | null> {
    const m = STORY_PATH.exec(new URL(url).pathname);
    if (!m) return null;

    const json = await io.fetchJson(`https://lobste.rs/s/${m[1]}.json`);
    const parsed = Story.safeParse(json);
    if (!parsed.success) return null;

    return httpUrlOrNull(parsed.data.url);
  }
}
