import type { ReaderPrefs } from "@readmepls/types";

const WIDTHS: Record<ReaderPrefs["width"], string> = {
  narrow: "55ch",
  normal: "68ch",
  wide: "80ch",
};

/** Inline custom properties for the reader container, layered over tokens.css.
 *  Emits the --reading-* names the theme + reader CSS already consume. */
export function readerCssVars(prefs: ReaderPrefs): string {
  // Both options resolve to Ronzino now; plan 4 removes the `font` pref.
  const font = "var(--font-reading)";
  return [
    `--reading-font: ${font}`,
    `--reading-size: ${prefs.size}px`,
    `--reading-leading: ${prefs.lineHeight}`,
    `--reading-measure: ${WIDTHS[prefs.width]}`,
  ].join("; ");
}
