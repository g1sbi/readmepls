import PocketBase from "pocketbase";
import { publicPbUrl } from "$lib/public-pb-url";

let _pb: PocketBase | null = null;

/** Browser-side PocketBase singleton. Shares the auth cookie written by hooks. */
export function browserPb(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(publicPbUrl());
    // The root layout constructs this client during SSR too, where `document`
    // does not exist. Cookie sync is browser-only; the browser gets its own
    // module instance and wires it up there.
    if (typeof document !== "undefined") {
      _pb.authStore.loadFromCookie(document.cookie);
      _pb.authStore.onChange(() => {
        document.cookie = _pb!.authStore.exportToCookie({ httpOnly: false });
      });
    }
  }
  return _pb;
}
