import type PocketBase from "pocketbase";

// Clear the session first so the login page never sees a stale auth store.
export async function signOut(
  pb: PocketBase,
  go: (path: string) => Promise<void>,
): Promise<void> {
  pb.authStore.clear();
  await go("/login");
}
