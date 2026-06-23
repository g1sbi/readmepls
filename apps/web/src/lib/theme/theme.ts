export type Theme = "light" | "dark" | "sepia";
export const THEMES = ["light", "dark", "sepia"] as const;

const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

/** Precedence: localStorage (instant paint) → account pref → light. */
export function resolveTheme(stored: string | null, pref?: string | null): Theme {
  if (isTheme(stored)) return stored;
  if (isTheme(pref)) return pref;
  return "light";
}

export function readStoredTheme(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("theme");
}

export function applyTheme(t: Theme): void {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
  if (typeof localStorage !== "undefined") localStorage.setItem("theme", t);
}
