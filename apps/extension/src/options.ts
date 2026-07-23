import {
  getConfig,
  setConfig,
  DEFAULT_INSTANCE_URL,
  type StorageArea,
} from "./config.js";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function load() {
  const cfg = await getConfig(storage);
  $<HTMLInputElement>("instance").value =
    cfg.instanceUrl || DEFAULT_INSTANCE_URL;
}

async function save() {
  const raw = $<HTMLInputElement>("instance").value.trim().replace(/\/+$/, "");
  const status = $("status");
  try {
    new URL(raw);
  } catch {
    status.textContent = "enter a valid url";
    return;
  }
  try {
    // Capture/auth reach the instance over CORS (server allow-lists the
    // extension origin via EXTENSION_ORIGINS) — no host permission needed.
    const res = await fetch(`${raw}/api/config`);
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    const { pbUrl } = (await res.json()) as { pbUrl: string };
    if (!pbUrl) throw new Error("config returned empty pbUrl");
    await setConfig(storage, { instanceUrl: raw, pbUrl });
    await chrome.storage.local.set({ token: "" });
    status.textContent = "saved ✓";
  } catch {
    status.textContent = "can't reach that instance — check the url";
  }
}

$("save").addEventListener("click", save);
void load();
