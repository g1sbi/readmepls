import type { ReaderPrefs } from "@readmepls/types";

const WIDTHS: Record<ReaderPrefs["width"], string> = {
  narrow: "55ch",
  normal: "68ch",
  wide: "80ch",
};

/** Inline custom properties for the reader container, layered over tokens.css.
 *  Emits the --reading-* names the theme + reader CSS already consume. */
export function readerCssVars(prefs: ReaderPrefs): string {
  const font = prefs.font === "serif" ? "var(--font-reading)" : "var(--reading-font-sans)";
  return [
    `--reading-font: ${font}`,
    `--reading-size: ${prefs.size}px`,
    `--reading-leading: ${prefs.lineHeight}`,
    `--reading-measure: ${WIDTHS[prefs.width]}`,
  ].join("; ");
}
