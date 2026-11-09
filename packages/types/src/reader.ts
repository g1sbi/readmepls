import { z } from "zod";

// Reader typography is fixed by design tokens now; the only per-user reader
// preference left is the colour theme.
export const ReaderPrefs = z.object({
  theme: z.enum(["light", "dark", "system"]),
});
export type ReaderPrefs = z.infer<typeof ReaderPrefs>;
