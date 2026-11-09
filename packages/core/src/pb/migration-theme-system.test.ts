import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEphemeralPb } from "./test-harness.js";

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
});
