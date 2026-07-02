import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { ensureSource, type SourceIO } from "./ensure-source.js";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

// Full 8-byte PNG signature is required: PocketBase content-sniffs the actual
// file bytes against the favicon field's allowed mimeTypes (not the passed
// contentType string), and a truncated 4-byte header is rejected as not-an-image.
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ioWith(html: string): SourceIO {
  return {
    fetchHtml: async () => html,
    fetchBytes: async (url) =>
      url.endsWith("/favicon.ico") ? { bytes: pngBytes, contentType: "image/png" } : null,
  };
}

describe("ensureSource", () => {
  it("creates one source per host and stores the favicon", async () => {
    const io = ioWith("<html><head></head></html>");
    const id = await ensureSource(h.pb, "nytimes.com", "The New York Times", io);
    const row = await h.pb.collection("sources").getOne(id);
    expect(row.host).toBe("nytimes.com");
    expect(row.name).toBe("The New York Times");
    expect(row.favicon_status).toBe("ok");
    expect(row.favicon).not.toBe("");
  });

  it("is idempotent — a second call returns the same row, no duplicate", async () => {
    const io = ioWith("<html><head></head></html>");
    const a = await ensureSource(h.pb, "idem.com", "Idem", io);
    const b = await ensureSource(h.pb, "idem.com", "Idem", io);
    expect(b).toBe(a);
    const list = await h.pb.collection("sources").getFullList({
      filter: h.pb.filter("host = {:h}", { h: "idem.com" }),
    });
    expect(list.length).toBe(1);
  });

  it("records favicon_status 'none' when no candidate yields bytes", async () => {
    const io: SourceIO = { fetchHtml: async () => "<html></html>", fetchBytes: async () => null };
    const id = await ensureSource(h.pb, "noicon.com", null, io);
    const row = await h.pb.collection("sources").getOne(id);
    expect(row.favicon_status).toBe("none");
    expect(row.favicon).toBe("");
  });
});
