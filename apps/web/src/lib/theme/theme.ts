export type ThemePref = "light" | "dark" | "system";
export const THEME_PREFS = ["light", "dark", "system"] as const;
export type Mode = "light" | "dark";

const isPref = (v: unknown): v is ThemePref =>
  typeof v === "string" && (THEME_PREFS as readonly string[]).includes(v);

/** Precedence: account pref → localStorage → system. Legacy "sepia" is not a
 *  valid pref, so it falls through to "system" from either source. */
export function resolveThemePref(
  stored: string | null,
  accountPref?: string | null,
): ThemePref {
  if (isPref(accountPref)) return accountPref;
  if (isPref(stored)) return stored;
  return "system";
}

export function resolveMode(pref: ThemePref, systemPrefersDark: boolean): Mode {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

/** One-time v2 migration: the old default stored "light" implicitly, which
 *  would pin everyone off "system". Keep only an explicit "dark". */
export function migrateStoredTheme(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): void {
  if (storage.getItem("theme-v") === "2") return;
  if (storage.getItem("theme") !== "dark") storage.removeItem("theme");
  storage.setItem("theme-v", "2");
}

export function applyTheme(pref: ThemePref, mode: Mode): void {
  if (typeof document !== "undefined")
    document.documentElement.dataset.theme = mode;
  if (typeof localStorage !== "undefined") localStorage.setItem("theme", pref);
}

export function watchSystemMode(
  onChange: (prefersDark: boolean) => void,
): () => void {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: { matches: boolean }) => onChange(e.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
