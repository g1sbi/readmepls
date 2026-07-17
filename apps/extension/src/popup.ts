import { getConfig, setConfig, type StorageArea } from "./config.js";
import { canCapture } from "./can-capture.js";
import { capture } from "./capture-client.js";
import { makePb, login, getValidToken } from "./auth.js";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const show = (id: string, on: boolean) => $(id).classList.toggle("hidden", !on);

/** Render "<text> <linkText>" into a node without innerHTML (avoids XSS). */
function textWithLink(
  el: HTMLElement,
  text: string,
  href: string,
  linkText: string,
) {
  el.textContent = text;
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = linkText;
  el.appendChild(a);
}

let TOKEN = "";
let INSTANCE_URL = "";

async function ensurePbUrl(instanceUrl: string): Promise<string> {
  const cfg = await getConfig(storage);
  if (cfg.pbUrl) return cfg.pbUrl;
  const res = await fetch(`${instanceUrl.replace(/\/+$/, "")}/api/config`);
  if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
  const { pbUrl } = (await res.json()) as { pbUrl: string };
  if (!pbUrl) throw new Error("config returned empty pbUrl");
  await setConfig(storage, { pbUrl });
  return pbUrl;
}

async function activeTab(): Promise<{ url: string; title: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url ?? "", title: tab?.title ?? "" };
}

function renderCaptureView(tab: { url: string; title: string }) {
  show("login", false);
  show("capture", true);
  $("page-title").textContent = tab.title || tab.url;
  $("page-url").textContent = tab.url;
  // Reset state unconditionally so re-entering this view (e.g. after a 401
  // re-login) never leaves a stale "saving…" status or a disabled button.
  const ok = canCapture(tab.url);
  $<HTMLButtonElement>("save").disabled = !ok;
  $("capture-status").textContent = ok ? "" : "can't save this page";
}

function renderLoginView() {
  show("capture", false);
  show("login", true);
}

async function onSave() {
  const saveBtn = $<HTMLButtonElement>("save");
  const tab = await activeTab();
  if (!canCapture(tab.url)) return;
  saveBtn.disabled = true;
  $("capture-status").textContent = "saving…";
  const result = await capture(fetch, INSTANCE_URL, TOKEN, tab.url);
  switch (result.kind) {
    case "saved":
      $("capture-status").textContent = "saved to library ✓";
      break;
    case "already":
      $("capture-status").textContent = "already in your library ✓";
      break;
    case "quota":
      textWithLink(
        $("capture-status"),
        "reading limit reached — ",
        INSTANCE_URL,
        "upgrade",
      );
      break;
    case "unauthorized":
      TOKEN = "";
      await chrome.storage.local.set({ token: "" });
      renderLoginView();
      break;
    case "error":
      $("capture-status").textContent =
        result.message === "network"
          ? "you're offline — retry"
          : "couldn't save — retry";
      saveBtn.disabled = false;
      break;
  }
}

async function onLogin(e: Event) {
  e.preventDefault();
  $("login-error").textContent = "signing in…";
  try {
    const pb = makePb(await ensurePbUrl(INSTANCE_URL));
    TOKEN = await login(
      pb,
      $<HTMLInputElement>("email").value,
      $<HTMLInputElement>("password").value,
    );
    await chrome.storage.local.set({ token: TOKEN });
    renderCaptureView(await activeTab());
  } catch {
    $("login-error").textContent = "sign-in failed — check email/password";
  }
}

async function boot() {
  try {
    const cfg = await getConfig(storage);
    INSTANCE_URL = cfg.instanceUrl;
    const pbUrl = await ensurePbUrl(INSTANCE_URL);
    const stored = (await chrome.storage.local.get(["token"])).token as
      | string
      | undefined;
    TOKEN = (await getValidToken(makePb(pbUrl), stored ?? "")) ?? "";
    if (TOKEN) renderCaptureView(await activeTab());
    else renderLoginView();
  } catch {
    show("boot-error", true);
    textWithLink(
      $("boot-error"),
      "can't reach your instance — ",
      "options.html",
      "check settings",
    );
  }
  $("login").addEventListener("submit", onLogin);
  $("save").addEventListener("click", onSave);
}

void boot();
