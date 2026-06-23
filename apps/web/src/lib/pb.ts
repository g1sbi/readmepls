import PocketBase from "pocketbase";

let _pb: PocketBase | null = null;

/** Browser-side PocketBase singleton. Shares the auth cookie written by hooks. */
export function browserPb(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(import.meta.env.VITE_PB_URL ?? "http://127.0.0.1:8090");
    _pb.authStore.loadFromCookie(document.cookie);
    _pb.authStore.onChange(() => {
      document.cookie = _pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }
  return _pb;
}
