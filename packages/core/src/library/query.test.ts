import { describe, it, expect } from "vitest";
import { buildLibraryQuery, applySearchIds } from "./query.js";
import { LibraryParams } from "@readmepls/types";

const P = (o: Partial<Record<string, unknown>>) => LibraryParams.parse(o);
const NOW = new Date("2026-07-04T12:00:00Z");

describe("buildLibraryQuery", () => {
  it("default view excludes archived and sorts newest-first", () => {
    const q = buildLibraryQuery(P({}), NOW);
    expect(q.filterExpr).toContain("status != {:");
    expect(Object.values(q.filterParams)).toContain("archived");
    expect(q.sort).toBe("-created");
    expect(q.perPage).toBe(24);
    expect(q.page).toBe(1);
  });

  it("read=finished maps to a progress threshold, not a status", () => {
    const q = buildLibraryQuery(P({ read: ["finished"] }), NOW);
    expect(q.filterExpr).toContain("progress >=");
    expect(Object.values(q.filterParams)).toContain(0.98);
  });

  it("OR within the read group, AND across groups", () => {
    const q = buildLibraryQuery(P({ read: ["unread", "reading"], time: ["long"] }), NOW);
    // read group OR-joins its two members, then AND-joins the time group
    expect(q.filterExpr).toMatch(/\(status = \{:\w+\} \|\| status = \{:\w+\}\)/);
    expect(q.filterExpr).toContain("&&");
    expect(q.filterExpr).toContain("content.read_time >");
  });

  it("time buckets map to read_time ranges", () => {
    expect(buildLibraryQuery(P({ time: ["quick"] }), NOW).filterExpr).toContain("content.read_time <");
    const med = buildLibraryQuery(P({ time: ["medium"] }), NOW);
    expect(med.filterExpr).toContain("content.read_time >=");
    expect(med.filterExpr).toContain("content.read_time <=");
  });

  it("tags use the article_tags back-relation, OR-joined", () => {
    const q = buildLibraryQuery(P({ tag: ["t1", "t2"] }), NOW);
    expect(q.filterExpr).toContain("article_tags_via_article.tag");
    expect(Object.values(q.filterParams)).toEqual(expect.arrayContaining(["t1", "t2"]));
  });

  it("collections use the collection_items back-relation", () => {
    const q = buildLibraryQuery(P({ collection: ["c1"] }), NOW);
    expect(q.filterExpr).toContain("collection_items_via_article.collection");
  });

  it("has=highlights / has=notes filter the highlights back-relation", () => {
    expect(buildLibraryQuery(P({ has: ["highlights"] }), NOW).filterExpr)
      .toContain("highlights_via_article.id");
    expect(buildLibraryQuery(P({ has: ["notes"] }), NOW).filterExpr)
      .toContain("highlights_via_article.note");
  });

  it("attention filters extract_status", () => {
    const q = buildLibraryQuery(P({ attention: ["failed", "partial"] }), NOW);
    expect(q.filterExpr).toContain("content.extract_status = {:");
    expect(Object.values(q.filterParams)).toEqual(expect.arrayContaining(["failed", "partial"]));
  });

  it("saved=week uses a created lower bound; older uses an upper bound", () => {
    expect(buildLibraryQuery(P({ saved: "week" }), NOW).filterExpr).toContain("created >=");
    expect(buildLibraryQuery(P({ saved: "older" }), NOW).filterExpr).toContain("created <");
  });

  it("published date filters content.published_at", () => {
    expect(buildLibraryQuery(P({ published: "month" }), NOW).filterExpr)
      .toContain("content.published_at >=");
  });

  it("lang and author OR-join their members", () => {
    const q = buildLibraryQuery(P({ lang: ["en", "es"], author: ["jane"] }), NOW);
    expect(q.filterExpr).toContain("content.lang = {:");
    expect(q.filterExpr).toContain("content.author = {:");
  });

  it("favsrc alone does not add a filter (favorites resolved to source ids upstream)", () => {
    // favsrc is applied by expanding to source ids in the IO layer; the pure
    // builder only consumes p.source. With no sources selected it is a no-op.
    const q = buildLibraryQuery(P({ favsrc: true }), NOW);
    expect(q.filterExpr).not.toContain("source");
  });

  it("relevance sort yields an empty PB sort string", () => {
    expect(buildLibraryQuery(P({ q: "x", sort: "relevance" }), NOW).sort).toBe("");
  });

  it("title sort maps to the content title", () => {
    expect(buildLibraryQuery(P({ sort: "title" }), NOW).sort).toBe("content.title");
  });

  it("never inlines a raw value into the expression", () => {
    const q = buildLibraryQuery(P({ tag: ["'; DROP TABLE"] }), NOW);
    expect(q.filterExpr).not.toContain("DROP TABLE");
    expect(Object.values(q.filterParams)).toContain("'; DROP TABLE");
  });
});

describe("applySearchIds", () => {
  it("builds an OR of id equalities with bound params", () => {
    const { expr, params } = applySearchIds(["a", "b"]);
    expect(expr).toBe("(id = {:sid0} || id = {:sid1})");
    expect(params).toEqual({ sid0: "a", sid1: "b" });
  });
});
