import type PocketBase from "pocketbase";
import { claimNextJob } from "./jobs/claim.js";
import { processJob, type ProcessDeps } from "./worker.js";

/**
 * One poll tick: claim a single job and process it. Returns true if a job was
 * processed, false if the queue was empty. Idempotent and safe to call in a loop
 * from multiple workers — claiming is guarded in claimNextJob.
 */
export async function runLoopOnce(
  pb: PocketBase,
  workerId: string,
  deps: ProcessDeps
): Promise<boolean> {
  const job = await claimNextJob(pb, workerId);
  if (!job) return false;
  await processJob(pb, job.id, deps);
  return true;
}
