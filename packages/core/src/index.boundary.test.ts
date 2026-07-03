import { describe, it, expect } from "vitest";

describe("client/server export boundary", () => {
  it("does not export jsdom-backed favicon parsing from the main barrel", async () => {
    // apps/web imports from "@readmepls/core" in browser code (source-view.ts,
    // library-sources.ts). Because this package ships raw TS with no build
    // step, any export reachable from index.ts drags its whole module — and
    // top-level imports — into the client bundle. favicon.ts does
    // `import { JSDOM } from "jsdom"`, a Node-only library that crashes at
    // runtime in the browser. It must stay behind a server-only subpath.
    const core = await import("./index.js");
    expect((core as Record<string, unknown>).pickFaviconCandidates).toBeUndefined();
  });
});
