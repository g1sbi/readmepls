import { ReaderPrefs } from "@readmepls/types";

const DEFAULTS: ReaderPrefs = { theme: "system" };

/** Parse stored users.reader_prefs onto safe defaults. Never throws: anything
 *  that isn't a valid prefs object (legacy sepia theme, junk, null) yields the
 *  defaults, and retired keys (font, size, ...) are dropped. */
export function withReaderDefaults(partial?: unknown): ReaderPrefs {
  const parsed = ReaderPrefs.safeParse(partial);
  return parsed.success ? parsed.data : { ...DEFAULTS };
}
