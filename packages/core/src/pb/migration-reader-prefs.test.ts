import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEphemeralPb } from "./test-harness.js";

const MIGRATIONS_SRC = "pocketbase/pb_migrations";
const FILE = "1720400000_reader_prefs_theme_only.js";
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_SRC)
  .filter((f) => f.endsWith(".js"))
  .sort();

describe("reader prefs theme-only migration", () => {
  it("keeps only a valid theme, leaves null alone, skips garbage, second boot is a no-op", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-rp-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-rp-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const mk = (n: string, reader_prefs?: unknown) =>
      h1.pb.collection("users").create({
        email: `${n}-${Date.now()}@test.local`,
        password: "password12345",
        passwordConfirm: "password12345",
        tier: "standard",
        monthly_quota_used: 0,
        ...(reader_prefs === undefined ? {} : { reader_prefs }),
      });
    const full = await mk("full", {
      font: "serif",
      size: 20,
      lineHeight: 1.8,
      width: "wide",
      theme: "dark",
    });
    const sizeOnly = await mk("size", { size: 40 });
    const sepia = await mk("sepia", { theme: "sepia" });
    const nul = await mk("null", null);
    const garbage = await mk("garbage", "garbage");
    const nulBefore = (await h1.pb.collection("users").getOne(nul.id))
      .reader_prefs;
    const garbageBefore = (await h1.pb.collection("users").getOne(garbage.id))
      .reader_prefs;
    await h1.stop();

    copyFileSync(join(MIGRATIONS_SRC, FILE), join(migrationsDir, FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const get = (h: typeof h2, id: string) =>
      h.pb.collection("users").getOne(id);
    expect((await get(h2, full.id)).reader_prefs).toEqual({ theme: "dark" });
    expect((await get(h2, sizeOnly.id)).reader_prefs).toEqual({
      theme: "system",
    });
    expect((await get(h2, sepia.id)).reader_prefs).toEqual({
      theme: "system",
    });
    expect((await get(h2, nul.id)).reader_prefs).toEqual(nulBefore);
    expect((await get(h2, garbage.id)).reader_prefs).toEqual(garbageBefore);
    await h2.stop();

    // second boot: already applied, nothing changes
    const h3 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    expect((await get(h3, full.id)).reader_prefs).toEqual({ theme: "dark" });
    expect((await get(h3, sizeOnly.id)).reader_prefs).toEqual({
      theme: "system",
    });
    await h3.stop();
  }, 60000);

  it("skips an unparseable row without aborting boot", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-rp-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-rp-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const mk = (n: string, reader_prefs: unknown) =>
      h1.pb.collection("users").create({
        email: `${n}-${Date.now()}@test.local`,
        password: "password12345",
        passwordConfirm: "password12345",
        tier: "standard",
        monthly_quota_used: 0,
        reader_prefs,
      });
    const bad = await mk("bad", { theme: "light" });
    const good = await mk("good", { theme: "dark", size: 20 });
    await h1.stop();
    execFileSync("sqlite3", [
      join(dataDir, "data.db"),
      `UPDATE users SET reader_prefs='{not json' WHERE id='${bad.id}'`,
    ]);

    copyFileSync(join(MIGRATIONS_SRC, FILE), join(migrationsDir, FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    expect(
      (await h2.pb.collection("users").getOne(good.id)).reader_prefs,
    ).toEqual({ theme: "dark" });
    await h2.stop();
  }, 60000);
});
