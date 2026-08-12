import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";

// A server that answers /api/health like PocketBase but rejects every auth
// attempt — i.e. what a *foreign* PocketBase (the dev/Docker instance on 8090,
// or another test's) looks like from the outside.
function startForeignPb(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: 200, message: "API is healthy." }));
      return;
    }
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: 400, message: "Failed to authenticate." }));
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server)),
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

describe("startEphemeralPb port ownership", () => {
  const servers: Server[] = [];
  const handles: PbHandle[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) await h.stop();
    for (const s of servers.splice(0)) {
      await new Promise((r) => s.close(() => r(undefined)));
    }
  });

  it("rejects rather than attaching to a PocketBase it did not start", async () => {
    const port = await freePort();
    servers.push(await startForeignPb(port));

    // The old harness health-checked the foreign server, then failed at
    // authWithPassword with a misleading "Failed to authenticate" 400.
    await expect(startEphemeralPb({ port })).rejects.toThrow(
      /could not bind|address already in use/i,
    );
  }, 60000);

  it("gives concurrent instances their own isolated database", async () => {
    const started = await Promise.all([
      startEphemeralPb(),
      startEphemeralPb(),
      startEphemeralPb(),
      startEphemeralPb(),
    ]);
    handles.push(...started);

    const urls = started.map((h) => h.url);
    expect(new Set(urls).size).toBe(urls.length);

    // Each instance must see only the record written to it.
    await started[0].pb.collection("users").create({
      email: "isolation@test.local",
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "standard",
      monthly_quota_used: 0,
    });

    for (const h of started.slice(1)) {
      const others = await h.pb.collection("users").getFullList();
      expect(others).toHaveLength(0);
    }
  }, 60000);
});
