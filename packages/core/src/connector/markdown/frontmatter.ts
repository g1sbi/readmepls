export interface Frontmatter {
  title: string;
  url: string;
  author: string | null;
  site_name: string | null;
  published: string | null;
  fetched: string;
  captured: string;
  status: string;
  tags: string[];
  ai_tags: string[];
  summary: string;
}

function yamlString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function yamlList(items: string[]): string {
  return "[" + items.map(yamlString).join(", ") + "]";
}

/** Render a deterministic YAML frontmatter block. Null/empty fields are omitted.
 *  Reader `progress` is intentionally absent so re-export is byte-stable. */
export function renderFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${yamlString(fm.title)}`);
  lines.push(`url: ${yamlString(fm.url)}`);
  if (fm.author) lines.push(`author: ${yamlString(fm.author)}`);
  if (fm.site_name) lines.push(`site_name: ${yamlString(fm.site_name)}`);
  if (fm.published) lines.push(`published: ${yamlString(fm.published)}`);
  lines.push(`fetched: ${yamlString(fm.fetched)}`);
  lines.push(`captured: ${yamlString(fm.captured)}`);
  lines.push(`status: ${yamlString(fm.status)}`);
  if (fm.tags.length) lines.push(`tags: ${yamlList(fm.tags)}`);
  if (fm.ai_tags.length) lines.push(`ai_tags: ${yamlList(fm.ai_tags)}`);
  if (fm.summary) lines.push(`summary: ${yamlString(fm.summary)}`);
  lines.push("---");
  return lines.join("\n");
}
