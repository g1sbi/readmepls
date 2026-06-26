import type { ArticleExport, ExportFile } from "../plugin.js";
import { htmlToMarkdown } from "./html-to-md.js";
import { renderFrontmatter } from "./frontmatter.js";
import { markHighlights, highlightsSection } from "./highlights.js";
import { exportFilename } from "./filename.js";

/** Pure: render one article into a single Markdown file. */
export function renderArticle(a: ArticleExport, used: Set<string>): ExportFile {
  const frontmatter = renderFrontmatter({
    title: a.title,
    url: a.url,
    author: a.author,
    site_name: a.siteName,
    published: a.publishedAt,
    fetched: a.fetchedAt,
    captured: a.capturedAt,
    status: a.status,
    tags: a.tags,
    ai_tags: a.aiTags,
    summary: a.summary,
  });

  const bodyMd = a.contentHtml ? htmlToMarkdown(a.contentHtml) : "_body unavailable_";
  const { body, unanchored } = markHighlights(bodyMd, a.highlights);
  const section = highlightsSection(unanchored);

  const parts = [frontmatter, `# ${a.title}`, body];
  if (section) parts.push(section);
  const contents = parts.join("\n\n") + "\n";

  const filename = exportFilename(a.title, a.id.slice(0, 6), used);
  return { filename, contents };
}
