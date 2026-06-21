import { z } from "zod";
export const AITagResult = z.object({
  tags: z.array(z.string().min(1)).max(12),
  summary: z.string(),
});
export type AITagResult = z.infer<typeof AITagResult>;
