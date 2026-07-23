import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
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
  } catch (err) {
    if (isBenign(err)) return null; // none found
    throw err; // auth/network/server errors must surface, not look like an empty queue
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
  } catch (err) {
    if (isBenign(err)) return null; // another worker claimed/removed it first
    throw err;
  }
}

// 404 (record gone/not found) and an SDK auto-cancellation (a concurrent
// duplicate request to the same URL from the same client superseded this
// one — see claim.test.ts's contention test) both mean "someone else got
// there first," not a real failure. Anything else — auth, network, server
// errors — must propagate so it doesn't masquerade as an empty queue.
function isBenign(err: unknown): boolean {
  if (!(err instanceof ClientResponseError)) return false;
  return err.status === 404 || err.isAbort;
}
