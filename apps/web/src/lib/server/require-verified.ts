import { error } from "@sveltejs/kit";

/**
 * Hard-block for the SaaS verification gate. Throws 403 when a hosted-SaaS user
 * has not confirmed their email. No-op for self-host (verification is SaaS-only)
 * and for already-verified users.
 */
export function requireVerified(
  locals: { verified: boolean },
  selfHosted: boolean,
): void {
  if (!selfHosted && !locals.verified) {
    throw error(403, "email not verified");
  }
}
