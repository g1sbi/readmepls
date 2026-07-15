import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: { WORKER_URL: "http://worker:8091", WORKER_SEARCH_SECRET: "s3cret" },
}));

import { semanticSearchIds } from "./semantic-search.js";

describe("semanticSearchIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls the worker with the secret and maps hits to article ids", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ results: [{ articleId: "a1" }, { articleId: "a2" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const ids = await semanticSearchIds("sleep", "u1");
    expect(ids).toEqual(["a1", "a2"]);
    const calledUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("user")).toBe("u1");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "x-worker-secret": "s3cret" });
  });

  it("throws on a non-ok worker response (so the caller can fall back)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    await expect(semanticSearchIds("x", "u1")).rejects.toThrow();
  });
});

import type PocketBase from "pocketbase";
import { keywordSearchIds } from "@readmepls/core";

vi.mock("@readmepls/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@readmepls/core")>()),
  keywordSearchIds: vi.fn(),
}));

import { hybridSearchIds } from "./semantic-search.js";

const pbStub = {} as unknown as PocketBase; // keywordSearchIds is mocked; pb is unused

function semanticResponse(ids: string[]): Response {
  return new Response(JSON.stringify({ results: ids.map((articleId) => ({ articleId })) }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

describe("hybridSearchIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fuses keyword and semantic ids by RRF", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["A", "B"]);
    vi.stubGlobal("fetch", vi.fn(async () => semanticResponse(["B", "C"])));
    // kw=[A,B], sem=[B,C] -> RRF order [B, A, C]
    expect(await hybridSearchIds(pbStub, "q", "u1")).toEqual(["B", "A", "C"]);
  });

  it("falls back to keyword-only when the semantic call fails", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["A", "B"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    expect(await hybridSearchIds(pbStub, "q", "u1")).toEqual(["A", "B"]);
  });

  it("falls back to keyword-only when the worker fetch throws (e.g. a timed-out/hung connection)", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["A", "B"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await hybridSearchIds(pbStub, "q", "u1")).toEqual(["A", "B"]);
  });
});
