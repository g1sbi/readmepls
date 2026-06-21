import { z } from "zod";
export const JobStatus = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = z.object({
  id: z.string(),
  user: z.string(),
  canonical_url: z.string().url(),
  type: z.literal("extract"),
  status: JobStatus,
  attempts: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  content: z.string().nullable(),
  locked_at: z.string().nullable(),
  locked_by: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;
