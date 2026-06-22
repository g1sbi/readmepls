import { z } from "zod";

export const ReaderPrefs = z.object({
  font: z.enum(["serif", "sans"]),
  size: z.number().int().min(14).max(24),
  lineHeight: z.number().min(1.3).max(2.0),
  width: z.enum(["narrow", "normal", "wide"]),
  theme: z.enum(["light", "dark", "sepia"]),
});
export type ReaderPrefs = z.infer<typeof ReaderPrefs>;
