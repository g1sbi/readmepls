import { describe, it, expect } from "vitest";
import { parseLibraryParams, serializeLibraryParams } from "./params.js";
import { LibraryParams } from "@readmepls/types";

const sp = (s: string) => new URLSearchParams(s);

describe("parseLibraryParams", () => {
  it("parses csv lists and scalars", () => {
    const p = parseLibraryParams(sp("read=unread,reading&tag=a,b&favsrc=1&saved=week&sort=longest_bogus"));
    expect(p.read).toEqual(["unread", "reading"]);
    expect(p.tag).toEqual(["a", "b"]);
    expect(p.favsrc).toBe(true);
    expect(p.saved).toBe("week");
    expect(p.sort).toBe("-created"); // bogus sort → default
  });

  it("drops unknown enum members but keeps valid ones", () => {
    const p = parseLibraryParams(sp("read=unread,bogus,archived"));
    expect(p.read).toEqual(["unread", "archived"]);
  });

  it("defaults an empty query", () => {
    expect(parseLibraryParams(sp(""))).toEqual(LibraryParams.parse({}));
  });

  it("clamps page to >= 1", () => {
    expect(parseLibraryParams(sp("page=0")).page).toBe(1);
    expect(parseLibraryParams(sp("page=abc")).page).toBe(1);
  });
});

describe("round-trip", () => {
  it("serialize then parse is identity", () => {
    const p = LibraryParams.parse({
      read: ["unread"], time: ["long"], tag: ["t1", "t2"], favsrc: true,
      saved: "month", has: ["notes"], q: "brain", sort: "-read_time", page: 2,
    });
    expect(parseLibraryParams(serializeLibraryParams(p))).toEqual(p);
  });

  it("a default view serializes to an empty query", () => {
    expect(serializeLibraryParams(LibraryParams.parse({})).toString()).toBe("");
  });
});
