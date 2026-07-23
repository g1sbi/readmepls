import { getConfig, type StorageArea } from "./config.js";
import { syncMarkerRegistration } from "./marker-registration.js";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

// Re-sync the dynamic marker on install and browser startup so self-hosted
// instances (and users upgrading from 0.1.0) become detectable without action.
async function sync(): Promise<void> {
  const { instanceUrl } = await getConfig(storage);
  await syncMarkerRegistration(
    chrome.scripting,
    chrome.permissions,
    instanceUrl,
  );
}

chrome.runtime.onInstalled.addListener(() => void sync());
chrome.runtime.onStartup.addListener(() => void sync());
