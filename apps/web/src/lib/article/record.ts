import type { RecordModel } from "pocketbase";

/**
 * A PocketBase article record with its content collection expanded.
 * PB records are loosely typed by the SDK (RecordModel carries all fields as
 * `[key: string]: any`); we narrow the fields the UI accesses explicitly plus
 * the expand shape used for the joined content record.
 */
export type ArticleRecord = RecordModel & {
  url: string;
  status: string;
  progress: number;
  expand?: { content?: RecordModel };
};
