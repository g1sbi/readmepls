import PocketBase from "pocketbase";

export function serverPb(): PocketBase {
  const url = process.env.PB_URL ?? "http://127.0.0.1:8090";
  return new PocketBase(url);
}
