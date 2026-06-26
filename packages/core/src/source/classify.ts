import type { SourceType } from "@readmepls/types";

export function classifySource(url: string): SourceType {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") return "youtube";
  return "article";
}
