import { z } from "zod";
export const SourceType = z.enum(["article", "x", "youtube", "other"]);
export type SourceType = z.infer<typeof SourceType>;
