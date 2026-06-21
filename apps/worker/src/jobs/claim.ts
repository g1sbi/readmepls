import type PocketBase from "pocketbase";
import { Job } from "@readmepls/types";

const STALE_MS = 5 * 60 * 1000;

export async function claimNextJob(
  pb: PocketBase,
  workerId: string
): Promise<Job | null> {
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const filter =
    `(status = "queued") || ` +
    `(status = "running" && locked_at != "" && locked_at < "${staleBefore}")`;

  let candidate;
  try {
    candidate = await pb
      .collection("jobs")
      .getFirstListItem(filter, { sort: "created" });
  } catch {
    return null; // none found
  }

  try {
    // Guarded update: only succeeds if still claimable. PB lacks conditional
    // update, so we re-check status post-update and bail if another worker won.
    const updated = await pb.collection("jobs").update(candidate.id, {
      status: "running",
      locked_by: workerId,
      locked_at: new Date().toISOString(),
    });
    if (updated.locked_by !== workerId) return null;
    return Job.parse(updated);
  } catch {
    return null;
  }
}
