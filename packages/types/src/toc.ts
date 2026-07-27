import { z } from "zod";

export type TocEntry = {
  id: string;
  text: string;
  level: number;
  children: TocEntry[];
};

// z.lazy handles the self-referential `children` array.
export const TocEntry: z.ZodType<TocEntry> = z.lazy(() =>
  z.object({
    id: z.string(),
    text: z.string(),
    level: z.number().int().min(1).max(6),
    children: z.array(TocEntry),
  }),
);
