import { z } from "zod";

export const HighlightColor = z.enum(["terracotta", "amber", "sage"]);
export type HighlightColor = z.infer<typeof HighlightColor>;

export const HighlightSelector = z.object({
  text: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
});
export type HighlightSelector = z.infer<typeof HighlightSelector>;

export const Highlight = HighlightSelector.extend({
  id: z.string(),
  user: z.string(),
  article: z.string(),
  color: HighlightColor,
  note: z.string(),
  created: z.string(),
});
export type Highlight = z.infer<typeof Highlight>;
