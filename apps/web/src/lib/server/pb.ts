import PocketBase from "pocketbase";

export function serverPb(): PocketBase {
  const url = process.env.PB_URL ?? "http://127.0.0.1:8090";
  return new PocketBase(url);
}

/** Server-only superuser client for privileged actions (e.g. job retry). */
export async function servicePb(): Promise<PocketBase> {
  const pb = serverPb();
  await pb
    .collection("_superusers")
    .authWithPassword(
      process.env.PB_ADMIN_EMAIL ?? "worker@local",
      process.env.PB_ADMIN_PASSWORD ?? ""
    );
  return pb;
}
