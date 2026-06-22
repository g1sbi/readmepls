import type PocketBase from "pocketbase";
import { claimNextJob } from "./jobs/claim.js";
import { processJob, type ProcessDeps } from "./worker.js";

/** Claim and process at most one job. Returns false if nothing was claimable. */
export async function runWorkerOnce(
  pb: PocketBase,
  workerId: string,
  deps: ProcessDeps
): Promise<boolean> {
  const job = await claimNextJob(pb, workerId);
  if (!job) return false;
  await processJob(pb, job.id, deps);
  return true;
}
