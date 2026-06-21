import PocketBase from "pocketbase";

export function makeClient(url: string): PocketBase {
  return new PocketBase(url);
}

export async function authAsSuperuser(
  pb: PocketBase,
  email: string,
  password: string
): Promise<void> {
  await pb.collection("_superusers").authWithPassword(email, password);
}
