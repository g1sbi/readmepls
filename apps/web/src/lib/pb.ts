import PocketBase from "pocketbase";
import { publicPbUrl } from "$lib/public-pb-url";

let _pb: PocketBase | null = null;

/** Browser-side PocketBase singleton. Shares the auth cookie written by hooks. */
export function browserPb(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(publicPbUrl());
    _pb.authStore.loadFromCookie(document.cookie);
    _pb.authStore.onChange(() => {
      document.cookie = _pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }
  return _pb;
}
