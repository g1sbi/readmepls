import { spawn, type ChildProcess } from "node:child_process";
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
  opts: { dir?: string; migrationsDir?: string; env?: Record<string, string> } = {}
): Promise<PbHandle> {
  const dir = opts.dir ?? mktempPbDir();
  const migrationsDir = opts.migrationsDir ?? "pocketbase/pb_migrations";
  const port = 8090 + Math.floor(Math.random() * 1000);
  const url = `http://127.0.0.1:${port}`;

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

  const proc = spawn(
    PB_BIN,
    ["serve", `--http=127.0.0.1:${port}`, `--dir=${dir}`, `--migrationsDir=${migrationsDir}`, "--hooksDir=pocketbase/pb_hooks"],
    { stdio: "ignore", env: { ...process.env, ...opts.env } }
  );

  await waitForHealth(url);
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

function mktempPbDir(): string {
  return mkdtempSync(join(tmpdir(), "pb-test-"));
}

function runOnce(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p: ChildProcess = spawn(PB_BIN, args, { stdio: "ignore" });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pb exited ${code}`))
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
