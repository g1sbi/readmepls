import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { slugify } from "@readmepls/core";

export type CreateCollectionError =
  | "duplicate"
  | "empty"
  | "failed"
  | "unauthenticated";

export type CreateCollectionResult =
  | { ok: true }
  | { ok: false; error: CreateCollectionError };

export async function createCollection(
  pb: PocketBase,
  name: string,
): Promise<CreateCollectionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  const uid = pb.authStore.model?.id;
  // Signed out: skip a request the API rules would reject anyway.
  if (!uid) return { ok: false, error: "unauthenticated" };
  try {
    await pb.collection("collections").create({
      user: uid,
      name: trimmed,
      slug: slugify(trimmed),
      parent: "",
      order: 0,
    });
    return { ok: true };
  } catch (err) {
    // The (user, slug) unique index rejects a repeat with a 400.
    if (err instanceof ClientResponseError && err.status === 400)
      return { ok: false, error: "duplicate" };
    // Everything else (5xx, network status 0, unexpected) must reach the user
    // as feedback, never as an unhandled rejection in a UI event handler.
    return { ok: false, error: "failed" };
  }
}
