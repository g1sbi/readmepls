import { describe, it, expect } from "vitest";
import {
  getConfig,
  setConfig,
  DEFAULT_INSTANCE_URL,
  type StorageArea,
} from "./config.js";

function fakeStorage(initial: Record<string, unknown> = {}): StorageArea {
  const store = { ...initial };
  return {
    get: async (keys) => Object.fromEntries(keys.map((k) => [k, store[k]])),
    set: async (items) => {
      Object.assign(store, items);
    },
  };
}

describe("config", () => {
  it("defaults instanceUrl and empty pbUrl when unset", async () => {
    const cfg = await getConfig(fakeStorage());
    expect(cfg).toEqual({ instanceUrl: DEFAULT_INSTANCE_URL, pbUrl: "" });
  });

  it("round-trips stored values", async () => {
    const storage = fakeStorage();
    await setConfig(storage, {
      instanceUrl: "https://my.host",
      pbUrl: "https://pb.my.host",
    });
    const cfg = await getConfig(storage);
    expect(cfg).toEqual({
      instanceUrl: "https://my.host",
      pbUrl: "https://pb.my.host",
    });
  });

  it("ignores blank stored instanceUrl and uses the default", async () => {
    const cfg = await getConfig(fakeStorage({ instanceUrl: "" }));
    expect(cfg.instanceUrl).toBe(DEFAULT_INSTANCE_URL);
  });
});
