import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { slugify } from "@readmepls/core";

export type CreateCollectionResult =
  | { ok: true }
  | { ok: false; error: "duplicate" | "empty" };

export async function createCollection(
  pb: PocketBase,
  name: string,
): Promise<CreateCollectionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  const uid = pb.authStore.model?.id;
  // Signed out: nothing to create against. Surface as "empty" rather than a
  // request that the API rules would reject anyway.
  if (!uid) return { ok: false, error: "empty" };
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
    if (!(err instanceof ClientResponseError)) throw err;
    // The (user, slug) unique index rejects a repeat with a 400.
    if (err.status === 400) return { ok: false, error: "duplicate" };
    throw err;
  }
}
