import PocketBase from "pocketbase";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
const statusSchema = z.object({ locked: z.boolean() });

export const load: PageServerLoad = async () => {
  const pb = new PocketBase(PB_URL);
  try {
    const raw = await pb.send("/api/single-account/status", { method: "GET" });
    const { locked } = statusSchema.parse(raw);
    return { locked };
  } catch {
    // The PocketBase hook (pb_hooks/single_account.pb.js) is the real
    // enforcement — this status check is cosmetic. Fail open on any error
    // (PB unreachable, hook missing) so a hiccup here never white-screens
    // the login page.
    return { locked: false };
  }
};
