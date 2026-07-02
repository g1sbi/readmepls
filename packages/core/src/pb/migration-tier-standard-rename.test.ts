import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEphemeralPb } from "./test-harness.js";

const MIGRATIONS_SRC = "pocketbase/pb_migrations";
const RENAME_FILE = "1719400000_tier_standard_rename.js";
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_SRC).filter((f) => f.endsWith(".js")).sort();

describe("tier standard-rename migration", () => {
  it("renames an existing free-tier user to standard once the migration is applied", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-tier-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-tier-migrations-"));
    // Boot 1: every migration up to (not including) the rename.
    for (const f of ALL_MIGRATIONS.filter((f) => f < RENAME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const user = await h1.pb.collection("users").create({
      email: `pre-rename-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "free",
      monthly_quota_used: 0,
    });
    await h1.stop();

    // Boot 2: same data dir, rename migration now present — PocketBase applies
    // it automatically on this boot, exactly as it would on a real deploy update.
    copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), join(migrationsDir, RENAME_FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const reread = await h2.pb.collection("users").getOne(user.id);
    expect(reread.tier).toBe("standard");
    await h2.stop();
  }, 30000);

  it("does not touch a pro-tier user", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-tier-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-tier-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < RENAME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const user = await h1.pb.collection("users").create({
      email: `pre-rename-pro-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "pro",
      monthly_quota_used: 0,
    });
    await h1.stop();

    copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), join(migrationsDir, RENAME_FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const reread = await h2.pb.collection("users").getOne(user.id);
    expect(reread.tier).toBe("pro");
    await h2.stop();
  }, 30000);

  it("renames an unset (empty-string) tier user to standard once the migration is applied", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-tier-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-tier-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < RENAME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    // PocketBase requires the field to be present on create even if empty —
    // pass an explicit empty string rather than omitting the field, to
    // reproduce a pre-existing row that never had `tier` set.
    const user = await h1.pb.collection("users").create({
      email: `pre-rename-empty-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "",
      monthly_quota_used: 0,
    });
    await h1.stop();

    copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), join(migrationsDir, RENAME_FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const reread = await h2.pb.collection("users").getOne(user.id);
    expect(reread.tier).toBe("standard");
    await h2.stop();
  }, 30000);
});
