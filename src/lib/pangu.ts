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
