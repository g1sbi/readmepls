import { error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import JSZip from "jszip";
import { getConnector, resolveTier, type TierConfig } from "@readmepls/core";
import type { Tier } from "@readmepls/types";
import { resolveArticleIds, loadArticleExports, type Scope } from "$lib/server/export.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

function must(url: URL, key: string): string {
  const v = url.searchParams.get(key);
  if (!v) throw error(400, `missing ${key}`);
  return v;
}

function parseScope(url: URL): Scope {
  const kind = url.searchParams.get("scope") ?? "library";
  if (kind === "single") return { kind: "single", id: must(url, "id") };
  if (kind === "collection") return { kind: "collection", id: must(url, "id") };
  if (kind === "filter")
    return { kind: "filter", tag: url.searchParams.get("tag"), q: url.searchParams.get("q") };
  return { kind: "library" };
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const scope = parseScope(url);

  const ids = await resolveArticleIds(locals.pb, scope, PB_URL, locals.pb.authStore.token);
  if (ids.length === 0) throw error(404, "nothing to export");

  const config: TierConfig = {
    selfHosted: process.env.SELF_HOSTED === "true",
    aiProviderConfigured: Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_PROVIDER === "mock",
  };
  const userRecord = locals.pb.authStore.model as { tier?: Tier } | null;
  const tier: Tier = resolveTier({ tier: userRecord?.tier ?? "standard" }, config);

  const articles = await loadArticleExports(locals.pb, ids, tier);
  if (articles.length === 0) throw error(404, "nothing to export");

  const connector = getConnector("markdown");
  if (!connector) throw error(500, "markdown connector unavailable");
  const result = await connector.export(articles);

  if (scope.kind === "single") {
    if (result.files.length === 0 || result.failures.length > 0) {
      throw error(422, result.failures[0]?.reason ?? "export failed");
    }
    const f = result.files[0]!;
    return new Response(f.contents, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${f.filename}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const f of result.files) zip.file(f.filename, f.contents);
  if (result.failures.length > 0) {
    const report =
      ["# Export report", "", "These articles could not be exported:", ""]
        .concat(result.failures.map((x) => `- ${x.title} (${x.url}) — ${x.reason}`))
        .join("\n") + "\n";
    zip.file("_export-report.md", report);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(bytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="readmepls-export.zip"`,
    },
  });
};
