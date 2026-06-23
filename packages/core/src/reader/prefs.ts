import { ReaderPrefs } from "@readmepls/types";

const DEFAULTS: ReaderPrefs = {
  font: "sans",
  size: 18,
  lineHeight: 1.6,
  width: "normal",
  theme: "light",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Merge a partial (e.g. from users.reader_prefs) onto safe defaults, clamping
 *  numerics and discarding any field that fails schema validation so one bad
 *  value can't wipe the valid overrides around it. */
export function withReaderDefaults(partial?: Partial<ReaderPrefs>): ReaderPrefs {
  const merged: Record<string, unknown> = { ...DEFAULTS, ...(partial ?? {}) };
  merged.size = clamp(Math.round(Number(merged.size)), 14, 24);
  merged.lineHeight = clamp(Number(merged.lineHeight), 1.3, 2.0);

  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof ReaderPrefs)[]) {
    const probe = ReaderPrefs.shape[k].safeParse(merged[k]);
    if (probe.success) (out[k] as unknown) = probe.data;
  }
  return out;
}
