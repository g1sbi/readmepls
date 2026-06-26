import type { ArticleStatus, Highlight } from "@readmepls/types";

/** Pure, runtime-agnostic input to a connector. The web route maps PocketBase
 *  records into this so core never imports PocketBase. */
export interface ArticleExport {
  id: string;
  title: string;
  url: string;
  author: string | null;
  siteName: string | null;
  lang: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  capturedAt: string;
  status: ArticleStatus;
  tags: string[];
  aiTags: string[];
  summary: string;
  contentHtml: string;
  highlights: Highlight[];
}

export interface ExportFile {
  filename: string;
  contents: string;
}

export interface ExportFailure {
  title: string;
  url: string;
  reason: string;
}

export interface ExportResult {
  files: ExportFile[];
  failures: ExportFailure[];
}

export type ConnectorConfig = Record<string, unknown>;

export interface ConnectorPlugin {
  readonly type: string;
  /** true when the connector is a not-yet-implemented placeholder. */
  readonly stub: boolean;
  export(articles: ArticleExport[], config?: ConnectorConfig): Promise<ExportResult>;
}

export class NotImplementedError extends Error {
  constructor(type: string) {
    super(`connector "${type}" is not implemented`);
    this.name = "NotImplementedError";
  }
}
