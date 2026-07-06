import type { LibraryParams, DatePreset } from "@readmepls/types";
import { FINISHED_THRESHOLD } from "./progress.js";

export interface LibraryQuery {
  filterExpr: string;
  filterParams: Record<string, unknown>;
  sort: string;
  page: number;
  perPage: number;
}

const PER_PAGE = 24;

const SORT_MAP: Record<LibraryParams["sort"], string> = {
  "-created": "-created", created: "created",
  "-published": "-content.published_at",
  "-read_time": "-content.read_time", read_time: "content.read_time",
  "-updated": "-updated", title: "content.title", relevance: "",
};

/** Lower bound (inclusive) for the "since" presets; upper bound for "older". */
function presetBound(preset: DatePreset, now: Date): { op: ">=" | "<"; iso: string } {
  const d = new Date(now);
  if (preset === "today") d.setUTCHours(0, 0, 0, 0);
  else if (preset === "week") d.setUTCDate(d.getUTCDate() - 7);
  else if (preset === "month") d.setUTCDate(d.getUTCDate() - 30);
  else if (preset === "year" || preset === "older") d.setUTCDate(d.getUTCDate() - 365);
  return { op: preset === "older" ? "<" : ">=", iso: d.toISOString().replace("T", " ").slice(0, 19) };
}

export function buildLibraryQuery(p: LibraryParams, now: Date = new Date()): LibraryQuery {
  const params: Record<string, unknown> = {};
  let n = 0;
  const bind = (v: unknown): string => { const k = `p${n++}`; params[k] = v; return `{:${k}}`; };
  const groups: string[] = [];
  const orGroup = (parts: string[]) => { if (parts.length) groups.push(parts.length === 1 ? parts[0]! : `(${parts.join(" || ")})`); };

  // read state (default: exclude archived)
  if (p.read.length === 0) {
    groups.push(`status != ${bind("archived")}`);
  } else {
    orGroup(p.read.map((r) =>
      r === "finished" ? `(progress >= ${bind(FINISHED_THRESHOLD)} && status != ${bind("archived")})`
        : `status = ${bind(r)}`));
  }

  // reading time buckets (minutes)
  orGroup(p.time.map((t) =>
    t === "quick" ? `content.read_time < ${bind(5)}`
      : t === "long" ? `content.read_time > ${bind(15)}`
        : `(content.read_time >= ${bind(5)} && content.read_time <= ${bind(15)})`));

  orGroup(p.tag.map((t) => `article_tags_via_article.tag ?= ${bind(t)}`));
  orGroup(p.collection.map((c) => `collection_items_via_article.collection ?= ${bind(c)}`));
  orGroup(p.source.map((s) => `content.source = ${bind(s)}`));
  orGroup(p.lang.map((l) => `content.lang = ${bind(l)}`));
  orGroup(p.author.map((a) => `content.author = ${bind(a)}`));
  orGroup(p.attention.map((a) => `content.extract_status = ${bind(a)}`));
  orGroup(p.has.map((h) =>
    h === "highlights" ? `highlights_via_article.id ?!= ${bind("")}`
      : `highlights_via_article.note ?!= ${bind("")}`));

  if (p.saved) { const b = presetBound(p.saved, now); groups.push(`created ${b.op} ${bind(b.iso)}`); }
  if (p.published) { const b = presetBound(p.published, now); groups.push(`content.published_at ${b.op} ${bind(b.iso)}`); }

  return {
    filterExpr: groups.join(" && "),
    filterParams: params,
    sort: SORT_MAP[p.sort],
    page: p.page,
    perPage: PER_PAGE,
  };
}

export function applySearchIds(ids: string[]): { expr: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => { params[`sid${i}`] = id; return `id = {:sid${i}}`; });
  return { expr: `(${parts.join(" || ")})`, params };
}
