import type { ArticleExport, ConnectorPlugin, ExportResult, ExportFile, ExportFailure } from "../plugin.js";
import { renderArticle } from "./render.js";

export class MarkdownConnector implements ConnectorPlugin {
  readonly type = "markdown";
  readonly stub = false;

  async export(articles: ArticleExport[]): Promise<ExportResult> {
    const used = new Set<string>();
    const files: ExportFile[] = [];
    const failures: ExportFailure[] = [];
    for (const a of articles) {
      try {
        files.push(renderArticle(a, used));
      } catch (err) {
        failures.push({
          title: a.title,
          url: a.url,
          reason: err instanceof Error ? err.message : "render failed",
        });
      }
    }
    return { files, failures };
  }
}
