import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PocketBase from "pocketbase";

const PB_BIN = process.env.PB_BIN ?? "pocketbase/pocketbase";
const SU_EMAIL = "worker@test.local";
const SU_PASS = "password12345";

export interface PbHandle {
  url: string;
  pb: PocketBase;
  stop: () => Promise<void>;
}

export async function startEphemeralPb(
  opts: {
    dir?: string;
    migrationsDir?: string;
    env?: Record<string, string>;
    port?: number;
  } = {},
): Promise<PbHandle> {
  const dir = opts.dir ?? mktempPbDir();
  const migrationsDir = opts.migrationsDir ?? "pocketbase/pb_migrations";

  // create superuser before serving — idempotent, safe to call again on a
  // second boot against the same dir (e.g. Task 5's before/after migration test).
  await runOnce([
    "superuser",
    "upsert",
    SU_EMAIL,
    SU_PASS,
    `--dir=${dir}`,
    `--migrationsDir=${migrationsDir}`,
  ]);

  // An explicit port is a caller's demand — fail loudly rather than quietly
  // serving somewhere else. Otherwise a lost bind race is retryable.
  const attempts = opts.port === undefined ? PORT_ATTEMPTS : 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const port = opts.port ?? (await reserveFreePort());
    try {
      return await serveOn(port, dir, migrationsDir, opts.env);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const PORT_ATTEMPTS = 5;

/**
 * Boot PocketBase on `port` and hand back a handle only once we have confirmed
 * *our* process owns that port.
 *
 * The health check alone is not that proof: if the bind fails, whoever already
 * holds the port answers it. That caused two failures — a confusing 400 when
 * the port belonged to a dev/Docker PocketBase, and silent database sharing
 * when it belonged to another test. So wait for the child's own bind
 * announcement first, and only then health-check for readiness.
 */
async function serveOn(
  port: number,
  dir: string,
  migrationsDir: string,
  env?: Record<string, string>,
): Promise<PbHandle> {
  const url = `http://127.0.0.1:${port}`;
  const proc = spawn(
    PB_BIN,
    [
      "serve",
      `--http=127.0.0.1:${port}`,
      `--dir=${dir}`,
      `--migrationsDir=${migrationsDir}`,
      "--hooksDir=pocketbase/pb_hooks",
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } },
  );

  // PocketBase reports "address already in use" here and then exits.
  let output = "";
  proc.stdout?.on("data", (c: Buffer) => (output += c.toString()));
  proc.stderr?.on("data", (c: Buffer) => (output += c.toString()));

  try {
    await waitForOwnBind(proc, () => output, url);
    await waitForHealth(url);
  } catch (err) {
    proc.kill("SIGKILL");
    throw err;
  }

  const pb = new PocketBase(url);
  await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

  return {
    url,
    pb,
    stop: () =>
      new Promise<void>((resolve) => {
        // Wait for the actual 'exit' event so the OS releases the SQLite file
        // lock before we resolve — callers that reboot PocketBase against the
        // same data directory (e.g. a before/after migration test) depend on
        // this to avoid a SQLITE_BUSY race on the second boot.
        if (proc.exitCode !== null || proc.signalCode !== null) {
          resolve();
          return;
        }
        proc.once("exit", () => resolve());
        proc.kill("SIGKILL");
      }),
  };
}

/**
 * Resolve only once *our* child says it took the port.
 *
 * Probing the URL cannot establish this: whoever already holds the port answers
 * the probe instantly, beating our child's bind failure. PocketBase announces
 * "Server started at" on success and "address already in use" on failure, so
 * its own stdout is the one authority on which process owns the socket.
 */
function waitForOwnBind(
  proc: ChildProcess,
  readOutput: () => string,
  url: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (err) reject(err);
      else resolve();
    };

    const timer = setInterval(() => {
      if (readOutput().includes("Server started at")) finish();
    }, 25);

    proc.once("error", (err) =>
      finish(new Error(`could not start PocketBase: ${err.message}`)),
    );
    proc.once("exit", (code) =>
      finish(
        new Error(
          `PocketBase exited (code ${code}) before serving ${url}; ` +
            `could not bind: ${readOutput().trim() || "(no output)"}`,
        ),
      ),
    );
  });
}

/**
 * Ask the OS for a free port. Closing the socket before PocketBase binds leaves
 * a small race, which is why serveOn still verifies and the caller retries —
 * but it makes collisions rare instead of a 1-in-1000 draw per call.
 */
function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close(() => reject(new Error("could not reserve a port")));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

function mktempPbDir(): string {
  return mkdtempSync(join(tmpdir(), "pb-test-"));
}

function runOnce(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p: ChildProcess = spawn(PB_BIN, args, { stdio: "ignore" });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pb exited ${code}`)),
    );
  });
}

async function waitForHealth(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("PocketBase did not become healthy");
}

export async function makeTestUser(pb: PocketBase): Promise<string> {
  const user = await pb.collection("users").create({
    email: `u${Date.now()}@test.local`,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
  return user.id;
}
