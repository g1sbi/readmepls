export type CardState = "processing" | "ready" | "partial" | "failed";

interface ContentLike {
  extract_status?: string;
}

export function deriveCardState(content: ContentLike | null | undefined): CardState {
  if (!content) return "processing";
  switch (content.extract_status) {
    case "ok":
      return "ready";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}
