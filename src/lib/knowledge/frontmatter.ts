import type { KnowledgeMetadata } from './types';

/**
 * Build clean YAML frontmatter for clipped knowledge articles
 */
export function buildFrontmatter(metadata: KnowledgeMetadata): string {
  const lines: string[] = ['---'];

  // Title (safe quote)
  lines.push(`title: ${safeYamlString(metadata.title)}`);

  if (metadata.author) {
    lines.push(`author: ${safeYamlString(metadata.author)}`);
  }

  if (metadata.publishDate) {
    lines.push(`publish_date: ${safeYamlString(metadata.publishDate)}`);
  }

  lines.push(`source_url: ${safeYamlString(metadata.sourceUrl)}`);
  lines.push(`platform: ${metadata.platform}`);
  lines.push(`clipped_at: ${safeYamlString(metadata.clippedAt)}`);

  if (metadata.coverUrl) {
    lines.push(`cover: ${safeYamlString(metadata.coverUrl)}`);
  }

  if (metadata.summary) {
    lines.push(`summary: ${safeYamlString(metadata.summary)}`);
  }

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push('tags:');
    for (const tag of metadata.tags) {
      lines.push(`  - ${safeYamlString(tag)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function safeYamlString(str: string): string {
  if (!str) return '""';
  // If string contains quotes, newlines, colons, or hashes, quote it safely
  const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  return `"${escaped}"`;
}
