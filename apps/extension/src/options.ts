import {
  getConfig,
  setConfig,
  DEFAULT_INSTANCE_URL,
  type StorageArea,
} from "./config.js";
import { syncMarkerRegistration } from "./marker-registration.js";

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
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    status.textContent = "enter a valid url";
    return;
  }
  // Ask for host access to the custom instance so fetch/auth are allowed.
  const granted = await chrome.permissions.request({
    origins: [`${origin}/*`],
  });
  if (!granted) {
    status.textContent = "permission needed to reach that instance";
    return;
  }
  try {
    const res = await fetch(`${raw}/api/config`);
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    const { pbUrl } = (await res.json()) as { pbUrl: string };
    if (!pbUrl) throw new Error("config returned empty pbUrl");
    await setConfig(storage, { instanceUrl: raw, pbUrl });
    // Host permission for `${origin}/*` was just granted above, so the marker
    // script can register straight away for this custom instance.
    await syncMarkerRegistration(chrome.scripting, chrome.permissions, raw);
    await chrome.storage.local.set({ token: "" });
    status.textContent = "saved ✓";
  } catch {
    status.textContent = "can't reach that instance — check the url";
  }
}

$("save").addEventListener("click", save);
void load();
