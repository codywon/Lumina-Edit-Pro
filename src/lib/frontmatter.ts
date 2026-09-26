export interface FrontmatterData {
  title?: string;
  author?: string;
  version?: string;
  date?: string;
  status?: string;
  category?: string;
  tags?: string[];
  [key: string]: any;
}

export interface ParsedMarkdown {
  frontmatter: FrontmatterData | null;
  rawYaml: string | null;
  body: string;
}

export function parseFrontmatter(markdown: string): ParsedMarkdown {
  if (!markdown) {
    return { frontmatter: null, rawYaml: null, body: markdown };
  }

  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: null, rawYaml: null, body: markdown };
  }

  const rawYaml = match[1];
  const body = markdown.slice(match[0].length);
  const data: FrontmatterData = {};

  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = val;
    }
  }

  return { frontmatter: data, rawYaml, body };
}

export function stringifyFrontmatter(data: FrontmatterData, body: string): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');
  return `${lines.join('\n')}${body.replace(/^\n+/, '')}`;
}
