const KEY = "readmepls:recent-searches";
const MAX = 5;

export function loadRecentSearches(storage: Storage = localStorage): string[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentSearch(
  q: string,
  storage: Storage = localStorage,
): string[] {
  const query = q.trim();
  if (!query) return loadRecentSearches(storage);
  const next = [
    query,
    ...loadRecentSearches(storage).filter((x) => x !== query),
  ].slice(0, MAX);
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode errors */
  }
  return next;
}

export function clearRecentSearches(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
