import type { ReaderPrefs } from "@readmepls/types";

const WIDTHS: Record<ReaderPrefs["width"], string> = {
  narrow: "55ch",
  normal: "68ch",
  wide: "80ch",
};

/** Inline custom properties for the reader container, layered over tokens.css. */
export function readerCssVars(prefs: ReaderPrefs): string {
  const font = prefs.font === "serif" ? "var(--font-reader-serif)" : "var(--font-reader-sans)";
  return [
    `--reader-font: ${font}`,
    `--reader-size: ${prefs.size}px`,
    `--reader-line-height: ${prefs.lineHeight}`,
    `--reader-width: ${WIDTHS[prefs.width]}`,
  ].join("; ");
}
