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
  stop: () => void;
}

export async function startEphemeralPb(): Promise<PbHandle> {
  const dir = mkdtempSync(join(tmpdir(), "pb-test-"));
  const port = 8090 + Math.floor(Math.random() * 1000);
  const url = `http://127.0.0.1:${port}`;

  // create superuser before serving
  await runOnce([
    "superuser",
    "upsert",
    SU_EMAIL,
    SU_PASS,
    `--dir=${dir}`,
    "--migrationsDir=pocketbase/pb_migrations",
  ]);

  const proc = spawn(
    PB_BIN,
    ["serve", `--http=127.0.0.1:${port}`, `--dir=${dir}`, "--migrationsDir=pocketbase/pb_migrations", "--hooksDir=pocketbase/pb_hooks"],
    { stdio: "ignore" }
  );

  await waitForHealth(url);
  const pb = new PocketBase(url);
  await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

  return { url, pb, stop: () => proc.kill("SIGKILL") };
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
    tier: "free",
    monthly_quota_used: 0,
  });
  return user.id;
}
