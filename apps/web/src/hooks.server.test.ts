import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pocketbase", () => ({
  default: class {
    authStore = { exportToCookie: () => "pb_auth=cookieval; Path=/" };
  },
}));
vi.mock("$lib/server/api-auth.js", () => ({ resolvePbAuth: vi.fn() }));
vi.mock("$lib/server/auth.js", () => ({ routeGuard: () => null }));

import { handle } from "./hooks.server.js";
import { resolvePbAuth } from "$lib/server/api-auth.js";

const ALLOWED = "chrome-extension://abc";
const mockResolve = resolvePbAuth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.EXTENSION_ORIGINS = ALLOWED;
  mockResolve.mockReset();
});

function event(method: string, path: string, origin?: string) {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return {
    url: new URL(`http://localhost${path}`),
    request: new Request(`http://localhost${path}`, { method, headers }),
    locals: {} as Record<string, unknown>,
  } as never;
}
const okResolve = async () => new Response("ok", { status: 200 });

describe("handle", () => {
  it("short-circuits an allow-listed OPTIONS preflight with 204 + ACAO", async () => {
    mockResolve.mockResolvedValue({ userId: null, viaBearer: false, verified: false });
    const res = await handle({
      event: event("OPTIONS", "/api/capture", ALLOWED),
      resolve: vi.fn(),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("rejects a non-listed OPTIONS preflight with 403 and no ACAO", async () => {
    mockResolve.mockResolvedValue({ userId: null, viaBearer: false, verified: false });
    const res = await handle({
      event: event("OPTIONS", "/api/capture", "https://evil.test"),
      resolve: vi.fn(),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("omits Set-Cookie and adds ACAO when auth came via bearer", async () => {
    mockResolve.mockResolvedValue({ userId: "u1", viaBearer: true, verified: true });
    const res = await handle({
      event: event("POST", "/api/capture", ALLOWED),
      resolve: okResolve,
    });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("writes Set-Cookie for cookie auth and no ACAO for a non-listed origin", async () => {
    mockResolve.mockResolvedValue({ userId: "u1", viaBearer: false, verified: true });
    const res = await handle({
      event: event("POST", "/api/capture", "https://evil.test"),
      resolve: okResolve,
    });
    expect(res.headers.get("set-cookie")).toContain("pb_auth");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("populates locals.verified from resolvePbAuth", async () => {
    mockResolve.mockResolvedValue({ userId: "u1", viaBearer: false, verified: true });
    const ev = event("POST", "/api/capture", ALLOWED);
    await handle({ event: ev, resolve: okResolve });
    expect((ev.locals as { verified: boolean }).verified).toBe(true);
  });
});
