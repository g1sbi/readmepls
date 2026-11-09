import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(__dirname, "../../app.html"), "utf8");

function bootBody(): string {
  const m = html.match(/<script data-theme-boot>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script data-theme-boot> in app.html");
  return m[1] ?? "";
}

function run(opts: {
  store?: Record<string, string>;
  systemDark?: boolean;
  throwingStorage?: boolean;
  writeThrowsOnly?: boolean;
}) {
  const store = { ...(opts.store ?? {}) };
  const dataset: Record<string, string> = {};
  const localStorage = opts.throwingStorage
    ? {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
        removeItem() {
          throw new Error("blocked");
        },
      }
    : {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          if (opts.writeThrowsOnly) throw new Error("read-only");
          delete store[k];
        },
      };
  if (opts.writeThrowsOnly)
    localStorage.setItem = () => {
      throw new Error("read-only");
    };
  const document = { documentElement: { dataset } };
  const matchMedia = () => ({ matches: !!opts.systemDark });
  new Function("document", "localStorage", "matchMedia", bootBody())(
    document,
    localStorage,
    matchMedia,
  );
  return { dataset, store };
}

describe("theme boot script", () => {
  it("is the only data-theme-boot script", () => {
    expect(html.match(/data-theme-boot/g)).toHaveLength(1);
  });
  it("stored dark -> dark", () => {
    expect(
      run({ store: { theme: "dark", "theme-v": "2" } }).dataset.theme,
    ).toBe("dark");
  });
  it("nothing stored, system dark -> dark", () => {
    expect(run({ systemDark: true }).dataset.theme).toBe("dark");
  });
  it("nothing stored, system light -> light", () => {
    expect(run({ systemDark: false }).dataset.theme).toBe("light");
  });
  it("legacy sepia, system dark -> dark and theme removed", () => {
    const r = run({ store: { theme: "sepia" }, systemDark: true });
    expect(r.dataset.theme).toBe("dark");
    expect(r.store.theme).toBeUndefined();
  });
  it("throwing storage -> light, no exception", () => {
    expect(run({ throwingStorage: true }).dataset.theme).toBe("light");
  });
  it("write-only storage failure, system dark -> dark", () => {
    expect(run({ writeThrowsOnly: true, systemDark: true }).dataset.theme).toBe(
      "dark",
    );
  });
});
