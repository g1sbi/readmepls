import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

describe("phase-2 migration", () => {
  it("persists reader_prefs json on users", async () => {
    const prefs = { font: "serif", size: 18, lineHeight: 1.6, width: "normal", theme: "light" };
    const u = await h.pb.collection("users").update(userId, { reader_prefs: prefs });
    expect(u.reader_prefs).toEqual(prefs);
  });

  it("persists canonical_url on articles", async () => {
    const a = await h.pb.collection("articles").create({
      user: userId,
      url: "https://example.com/x",
      canonical_url: "https://example.com/x",
      status: "unread",
      progress: 0,
      is_private: false,
    });
    expect(a.canonical_url).toBe("https://example.com/x");
  });
});
