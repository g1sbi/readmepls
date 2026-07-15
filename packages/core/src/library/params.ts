import {
  LibraryParams, READ_STATES, TIME_BUCKETS, DATE_PRESETS, HAS_FLAGS,
  ATTENTION, SORTS, DatePreset,
} from "@readmepls/types";

const csv = (sp: URLSearchParams, key: string): string[] => {
  const raw = sp.get(key);
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
};
const only = <T extends readonly string[]>(vals: string[], allowed: T): T[number][] =>
  vals.filter((v): v is T[number] => (allowed as readonly string[]).includes(v));
const preset = (sp: URLSearchParams, key: string): DatePreset | null => {
  const v = sp.get(key);
  return v && (DATE_PRESETS as readonly string[]).includes(v) ? (v as DatePreset) : null;
};

export function parseLibraryParams(sp: URLSearchParams): LibraryParams {
  const sortRaw = sp.get("sort") ?? "";
  const pageNum = Number.parseInt(sp.get("page") ?? "", 10);
  return LibraryParams.parse({
    read: only(csv(sp, "read"), READ_STATES),
    time: only(csv(sp, "time"), TIME_BUCKETS),
    tag: csv(sp, "tag"),
    collection: csv(sp, "collection"),
    source: csv(sp, "source"),
    favsrc: sp.get("favsrc") === "1",
    saved: preset(sp, "saved"),
    published: preset(sp, "published"),
    lang: csv(sp, "lang"),
    author: csv(sp, "author"),
    has: only(csv(sp, "has"), HAS_FLAGS),
    attention: only(csv(sp, "attention"), ATTENTION),
    q: sp.get("q") ?? "",
    sort: (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "-created",
    page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1,
  });
}

export function serializeLibraryParams(p: LibraryParams): URLSearchParams {
  const sp = new URLSearchParams();
  const list = (k: string, v: string[]) => { if (v.length) sp.set(k, v.join(",")); };
  list("read", p.read); list("time", p.time); list("tag", p.tag);
  list("collection", p.collection); list("source", p.source);
  list("lang", p.lang); list("author", p.author); list("has", p.has);
  list("attention", p.attention);
  if (p.favsrc) sp.set("favsrc", "1");
  if (p.saved) sp.set("saved", p.saved);
  if (p.published) sp.set("published", p.published);
  if (p.q) sp.set("q", p.q);
  if (p.sort !== "-created") sp.set("sort", p.sort);
  if (p.page !== 1) sp.set("page", String(p.page));
  return sp;
}
