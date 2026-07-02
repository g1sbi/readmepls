import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { pickFaviconCandidates } from "@readmepls/core";

export interface SourceIO {
  fetchHtml(url: string): Promise<string>;
  fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

/** Download the best favicon for a host. Returns a File to store, or null. */
async function fetchFavicon(host: string, io: SourceIO): Promise<File | null> {
  const base = `https://${host}/`;
  let html = "";
  try {
    html = await io.fetchHtml(base);
  } catch {
    // Site root unreachable — still try the /favicon.ico fallback below.
  }
  const candidates = pickFaviconCandidates(html, base);
  for (const url of candidates) {
    let res: { bytes: Uint8Array; contentType: string } | null = null;
    try {
      res = await io.fetchBytes(url);
    } catch {
      continue; // blocked/errored candidate — try the next
    }
    if (res && res.bytes.length > 0 && res.contentType.startsWith("image/")) {
      const ext = url.split(".").pop()?.split(/[?#]/)[0] || "ico";
      // res.bytes genuinely comes from `new Uint8Array(arrayBuffer)` in
      // safe-fetch.ts, so its buffer is a real ArrayBuffer — but TS 5.7 widens
      // Uint8Array's buffer type to ArrayBufferLike, which BlobPart rejects.
      return new File([res.bytes as Uint8Array<ArrayBuffer>], `favicon.${ext}`, {
        type: res.contentType,
      });
    }
  }
  return null;
}

/**
 * Find-or-create the source row for a host, best-effort favicon. Idempotent and
 * race-safe: relies on the unique host index; a concurrent create that loses the
 * race is caught and re-read. Never throws for favicon failures.
 */
export async function ensureSource(
  pb: PocketBase,
  host: string,
  name: string | null,
  io: SourceIO
): Promise<string> {
  const existing = await findByHost(pb, host);
  if (existing) {
    if (name && !existing.name) {
      await pb.collection("sources").update(existing.id, { name });
    }
    if (existing.favicon_status === "pending") {
      await attachFavicon(pb, existing.id, host, io);
    }
    return existing.id;
  }

  let created;
  try {
    created = await pb.collection("sources").create({
      host, name, favicon_status: "pending",
    });
  } catch (err) {
    // Lost a create race on the unique host index — re-read the winner.
    if (err instanceof ClientResponseError && err.status === 400) {
      const winner = await findByHost(pb, host);
      if (winner) return winner.id;
    }
    throw err;
  }
  await attachFavicon(pb, created.id, host, io);
  return created.id;
}

async function findByHost(pb: PocketBase, host: string) {
  try {
    return await pb.collection("sources").getFirstListItem(
      pb.filter("host = {:h}", { h: host })
    );
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

async function attachFavicon(pb: PocketBase, id: string, host: string, io: SourceIO): Promise<void> {
  const file = await fetchFavicon(host, io);
  await pb.collection("sources").update(id, file
    ? { favicon: file, favicon_status: "ok" }
    : { favicon_status: "none" });
}
