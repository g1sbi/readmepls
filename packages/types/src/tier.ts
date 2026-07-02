import { z } from "zod";

export const Tier = z.enum(["standard", "pro"]);
export type Tier = z.infer<typeof Tier>;
