import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEphemeralPb } from "./test-harness.js";

const PB_BIN = process.env.PB_BIN ?? "pocketbase/pocketbase";
const MIGRATIONS_SRC = "pocketbase/pb_migrations";
const THEME_FILE = "1720300000_theme_system.js";
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_SRC)
  .filter((f) => f.endsWith(".js"))
  .sort();

describe("theme system migration", () => {
  it("moves sepia/light to system and leaves dark, empty prefs and other keys alone", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-theme-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-theme-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < THEME_FILE)) {
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
    const sepia = await mk("sepia", { theme: "sepia", size: 18 });
    const light = await mk("light", { theme: "light" });
    const dark = await mk("dark", { theme: "dark" });
    const none = await mk("none");
    const noneBefore = (await h1.pb.collection("users").getOne(none.id))
      .reader_prefs;
    await h1.stop();

    copyFileSync(
      join(MIGRATIONS_SRC, THEME_FILE),
      join(migrationsDir, THEME_FILE),
    );
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const get = (id: string) => h2.pb.collection("users").getOne(id);
    expect((await get(sepia.id)).reader_prefs).toEqual({
      theme: "system",
      size: 18,
    });
    expect((await get(light.id)).reader_prefs).toEqual({ theme: "system" });
    expect((await get(dark.id)).reader_prefs).toEqual({ theme: "dark" });
    expect((await get(none.id)).reader_prefs).toEqual(noneBefore);
    await h2.stop();
  }, 30000);

  it("skips a row with unparseable reader_prefs, still migrates the rest", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-theme-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-theme-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < THEME_FILE)) {
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
    const good = await mk("good", { theme: "sepia", size: 20 });
    await h1.stop();
    // Corrupt one row directly in SQLite (the API would reject invalid JSON).
    execFileSync("sqlite3", [
      join(dataDir, "data.db"),
      `UPDATE users SET reader_prefs='{not json' WHERE id='${bad.id}'`,
    ]);

    copyFileSync(
      join(MIGRATIONS_SRC, THEME_FILE),
      join(migrationsDir, THEME_FILE),
    );
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    expect(
      (await h2.pb.collection("users").getOne(good.id)).reader_prefs,
    ).toEqual({ theme: "system", size: 20 });
    await h2.stop();
  }, 30000);

  it("down maps system back to light and keeps other keys", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-theme-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-theme-migrations-"));
    // `down 1` reverts the newest migration, so stop at the theme one.
    for (const f of ALL_MIGRATIONS.filter((f) => f <= THEME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const sys = await h1.pb.collection("users").create({
      email: `sys-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "standard",
      monthly_quota_used: 0,
      reader_prefs: { theme: "system", size: 18 },
    });
    const dark = await h1.pb.collection("users").create({
      email: `dk-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "standard",
      monthly_quota_used: 0,
      reader_prefs: { theme: "dark" },
    });
    await h1.stop();
    execFileSync(
      PB_BIN,
      [
        "migrate",
        "down",
        "1",
        `--dir=${dataDir}`,
        `--migrationsDir=${migrationsDir}`,
      ],
      { input: "y\n" },
    ); // answers the revert confirmation prompt
    const h2 = await startEphemeralPb({
      dir: dataDir,
      migrationsDir: mkdtempSync(join(tmpdir(), "pb-theme-empty-")),
    });
    expect(
      (await h2.pb.collection("users").getOne(sys.id)).reader_prefs,
    ).toEqual({ theme: "light", size: 18 });
    expect(
      (await h2.pb.collection("users").getOne(dark.id)).reader_prefs,
    ).toEqual({ theme: "dark" });
    await h2.stop();
  }, 30000);
});
