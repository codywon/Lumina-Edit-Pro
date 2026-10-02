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

  // 1. Standard YAML frontmatter
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    const rawYaml = match[1];
    const body = markdown.slice(match[0].length);
    const data = parseYamlString(rawYaml);
    return { frontmatter: Object.keys(data).length > 0 ? data : null, rawYaml, body };
  }

  // 2. Corrupted Setext heading frontmatter (e.g. from previous tiptap auto-save)
  const corruptedMatch = markdown.match(/^---\r?\n\s*##\s*(title:\s*["'][^"']+["'][\s\S]*?)(?=\r?\n#|\r?\n\r?\n|$)/i);
  if (corruptedMatch) {
    const rawText = corruptedMatch[1];
    const body = markdown.slice(corruptedMatch[0].length).replace(/^[\r\n]+/, '');
    const data = parseCorruptedYamlInline(rawText);
    const reconstructedYaml = Object.entries(data)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n');
    return { frontmatter: data, rawYaml: reconstructedYaml, body };
  }

  return { frontmatter: null, rawYaml: null, body: markdown };
}

function parseCorruptedYamlInline(text: string): FrontmatterData {
  const data: FrontmatterData = {};
  const regex = /([\w_-]+):\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
    data[key] = val;
  }
  return data;
}

function parseYamlString(rawYaml: string): FrontmatterData {
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
  return data;
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
