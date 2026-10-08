/**
 * CJK & English Spacing Formatter
 * Automatically inserts a breathing space between CJK characters and Latin/numbers/symbols.
 * e.g., "用Python编写Markdown" -> "用 Python 编写 Markdown"
 */
export function formatPanguSpacing(text: string): string {
  if (!text) return '';

  return text
    // CJK and English/Number
    .replace(/([\u4e00-\u9fa5\u3040-\u30ff])([a-zA-Z0-9])/g, '$1 $2')
    .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5\u3040-\u30ff])/g, '$1 $2')
    // CJK and common inline symbols (% & + = < >)
    .replace(/([\u4e00-\u9fa5\u3040-\u30ff])([%&+=<>])/g, '$1 $2')
    .replace(/([%&+=<>])([\u4e00-\u9fa5\u3040-\u30ff])/g, '$1 $2');
}

/**
 * Normalizes CJK emphasis delimiters to comply with CommonMark specifications.
 * In CommonMark, a right-flanking delimiter `**` preceded by punctuation MUST be
 * followed by whitespace or punctuation to be valid. In Chinese/CJK writing, users
 * often write `**标签：**内容` or `**名称（备注）**说明` where `**` is immediately
 * followed by a Chinese/alphanumeric character without a space.
 * This helper inserts a safe whitespace so that CommonMark parsers (e.g. markdown-it / tiptap)
 * can cleanly render them as bold instead of exposing raw `**`.
 */
export function normalizeCjkEmphasis(markdown: string): string {
  if (!markdown || !markdown.includes('**')) return markdown;

  // Split by code blocks and inline code to avoid modifying code contents
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(
      /(\*\*[^\n*]+?[：:）\)\】\]》"'”’！？!?；;])\*\*([^\s*`_])/g,
      '$1** $2'
    );
  }
  return parts.join('');
}
