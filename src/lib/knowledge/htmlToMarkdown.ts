/**
 * Specialized HTML to Markdown converter for Lumina Edit Pro
 * Supports GFM tables, nested lists, tasklists, callouts, math formulas, and code blocks.
 */

export interface HtmlToMarkdownOptions {
  baseUrl?: string;
  preserveImages?: boolean;
}

export function convertHtmlToMarkdown(element: Element | Document, options: HtmlToMarkdownOptions = {}): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDoc = element && (element as any).nodeType === 9;
  const root = isDoc ? (element as Document).body : element;
  if (!root) return '';

  const md = processNode(root, { listDepth: 0, inList: false, ...options });
  return cleanMarkdownWhitespace(md);
}

interface Context extends HtmlToMarkdownOptions {
  listDepth: number;
  inList: boolean;
  orderedIndex?: number;
}

function processNode(node: Node, ctx: Context): string {
  // 3 = Node.TEXT_NODE
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    // Compress multiple spaces/tabs into single space (unless inside pre/code)
    return text.replace(/[ \t]+/g, ' ');
  }

  // 1 = Node.ELEMENT_NODE
  if (node.nodeType !== 1) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // Ignored tags
  if (['script', 'style', 'noscript', 'meta', 'link', 'svg', 'button', 'form'].includes(tag)) {
    return '';
  }

  // Check hidden elements
  const style = el.getAttribute('style') || '';
  if (/display\s*:\s*none/i.test(style) || el.getAttribute('aria-hidden') === 'true') {
    return '';
  }

  // Math formula detection
  const formula = el.getAttribute('data-formula') || el.getAttribute('data-tex') || el.getAttribute('alt');
  if ((el.classList.contains('katex') || el.classList.contains('math') || el.classList.contains('formula')) && formula) {
    const isBlock = tag === 'div' || el.classList.contains('display-math');
    return isBlock ? `\n\n$$\n${formula.trim()}\n$$\n\n` : `$${formula.trim()}$`;
  }

  // Headings
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1], 10);
    const hashes = '#'.repeat(level);
    const inner = processChildren(el, ctx).trim();
    return inner ? `\n\n${hashes} ${inner}\n\n` : '';
  }

  // Paragraphs
  if (tag === 'p') {
    const inner = processChildren(el, ctx).trim();
    return inner ? `\n\n${inner}\n\n` : '';
  }

  // Line breaks
  if (tag === 'br') {
    return '\n';
  }

  // Horizontal rules
  if (tag === 'hr') {
    return '\n\n---\n\n';
  }

  // Strong / Bold
  if (['strong', 'b'].includes(tag)) {
    const inner = processChildren(el, ctx).trim();
    return inner ? `**${inner}**` : '';
  }

  // Emphasis / Italic
  if (['em', 'i'].includes(tag)) {
    const inner = processChildren(el, ctx).trim();
    return inner ? `*${inner}*` : '';
  }

  // Strikethrough
  if (['del', 's', 'strike'].includes(tag)) {
    const inner = processChildren(el, ctx).trim();
    return inner ? `~~${inner}~~` : '';
  }

  // Code Block (<pre> or <pre><code>)
  if (tag === 'pre') {
    const codeEl = el.querySelector('code') || el;
    let codeText = codeEl.textContent || '';
    // Remove trailing newline if present
    codeText = codeText.replace(/\r\n/g, '\n').replace(/\n$/, '');

    // Extract language from class="language-js" or class="lang-python"
    let lang = '';
    const classAttr = (codeEl.getAttribute('class') || '') + ' ' + (el.getAttribute('class') || '');
    const langMatch = classAttr.match(/(?:language-|lang-)([\w-]+)/i);
    if (langMatch) {
      lang = langMatch[1].toLowerCase();
    }

    return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
  }

  // Inline Code
  if (tag === 'code') {
    const inner = el.textContent || '';
    return inner ? `\`${inner}\`` : '';
  }

  // Blockquotes and Callouts
  if (tag === 'blockquote' || el.classList.contains('callout') || el.classList.contains('alert-block')) {
    const isCallout = el.classList.contains('callout') || el.classList.contains('callout-block') || el.classList.contains('alert-block');
    const calloutType = el.getAttribute('data-callout-type') || 'NOTE';
    const inner = processChildren(el, ctx).trim();
    const lines = inner.split('\n');

    if (isCallout) {
      const header = `> [!${calloutType.toUpperCase()}]`;
      const quoted = lines.map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
      return `\n\n${header}\n${quoted}\n\n`;
    }

    const quoted = lines.map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
    return `\n\n${quoted}\n\n`;
  }

  // Links
  if (tag === 'a') {
    const href = el.getAttribute('href');
    const text = processChildren(el, ctx).trim();
    if (!href || href.startsWith('javascript:')) {
      return text;
    }
    // If text is empty or image
    return text ? `[${text}](${resolveUrl(href, ctx.baseUrl)})` : href;
  }

  // Images
  if (tag === 'img') {
    if (ctx.preserveImages === false) return '';

    // Support WeChat data-src, lazy-src, etc.
    const src =
      el.getAttribute('src') ||
      el.getAttribute('data-src') ||
      el.getAttribute('data-original-src') ||
      el.getAttribute('data-actualsrc') ||
      el.getAttribute('data-url');

    if (!src || src.startsWith('data:image/svg+xml;base64,PHN2Zy') || src.includes('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')) {
      // 1px transparent gif or placeholder
      return '';
    }

    const alt = el.getAttribute('alt') || el.getAttribute('title') || 'image';
    return `\n\n![${alt}](${resolveUrl(src, ctx.baseUrl)})\n\n`;
  }

  // Lists (Unordered & Ordered)
  if (tag === 'ul' || tag === 'ol') {
    const isOrdered = tag === 'ol';
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
    let listMd = '\n\n';

    items.forEach((item, index) => {
      const childCtx: Context = {
        ...ctx,
        listDepth: ctx.listDepth + 1,
        inList: true,
        orderedIndex: isOrdered ? index + 1 : undefined,
      };
      listMd += processListItem(item as HTMLElement, childCtx);
    });

    return listMd + '\n\n';
  }

  // Tables
  if (tag === 'table') {
    return processTable(el);
  }

  // Task item or Todo block (div or li with data-block-type="todo" or class="task-item")
  if (
    !ctx.inList &&
    (el.getAttribute('data-block-type') === 'todo' || el.classList.contains('task-item') || el.classList.contains('todo-block'))
  ) {
    const isChecked = el.getAttribute('data-checked') === 'true' || !!el.querySelector('input:checked');
    const prefix = isChecked ? '- [x] ' : '- [ ] ';
    const inner = processChildren(el, ctx).trim();
    return `\n\n${prefix}${inner}\n\n`;
  }

  // Divs and Sections
  if (['div', 'section', 'article', 'main'].includes(tag)) {
    const inner = processChildren(el, ctx);
    return inner ? `\n${inner}\n` : '';
  }

  // Default: process all children
  return processChildren(el, ctx);
}

function processChildren(el: Element, ctx: Context): string {
  let result = '';
  for (const child of Array.from(el.childNodes)) {
    result += processNode(child, ctx);
  }
  return result;
}

function processListItem(li: HTMLElement, ctx: Context): string {
  const indent = '  '.repeat(Math.max(0, ctx.listDepth - 1));

  // Check for tasklist item (checkbox)
  const checkbox = li.querySelector('input[type="checkbox"]');
  let prefix = '';

  if (checkbox) {
    const isChecked = checkbox.hasAttribute('checked') || (checkbox as HTMLInputElement).checked;
    prefix = isChecked ? '- [x] ' : '- [ ] ';
    checkbox.remove(); // don't process checkbox tag again
  } else if (ctx.orderedIndex !== undefined) {
    prefix = `${ctx.orderedIndex}. `;
  } else {
    prefix = '- ';
  }

  const inner = processChildren(li, ctx).trim();
  if (!inner) return '';

  const lines = inner.split('\n');
  const firstLine = `${indent}${prefix}${lines[0]}`;
  const subsequentLines = lines
    .slice(1)
    .map((l) => (l.trim() ? `${indent}  ${l}` : ''))
    .join('\n');

  return subsequentLines ? `${firstLine}\n${subsequentLines}\n` : `${firstLine}\n`;
}

function processTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  const alignments: ('left' | 'center' | 'right')[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const cells = Array.from(row.children).filter((c) => ['th', 'td'].includes(c.tagName.toLowerCase()));
    if (cells.length === 0) continue;

    const rowData: string[] = [];
    cells.forEach((cell, cIdx) => {
      // Record alignment on first row
      if (rIdx === 0) {
        const alignAttr = cell.getAttribute('align') || '';
        const styleAlign = (cell.getAttribute('style') || '').toLowerCase();
        if (alignAttr === 'center' || styleAlign.includes('text-align: center') || styleAlign.includes('text-align:center')) {
          alignments[cIdx] = 'center';
        } else if (alignAttr === 'right' || styleAlign.includes('text-align: right') || styleAlign.includes('text-align:right')) {
          alignments[cIdx] = 'right';
        } else {
          alignments[cIdx] = 'left';
        }
      }

      // Convert inner cell contents to clean inline text
      const cellText = cleanCellText(cell);
      rowData.push(cellText);
    });

    tableData.push(rowData);
  }

  if (tableData.length === 0) return '';

  // Normalize column count
  const maxCols = Math.max(...tableData.map((r) => r.length));
  tableData.forEach((row) => {
    while (row.length < maxCols) {
      row.push('');
    }
  });

  while (alignments.length < maxCols) {
    alignments.push('left');
  }

  // Header row
  const headerRow = tableData[0];
  const headerMd = `| ${headerRow.join(' | ')} |`;

  // Separator row
  const separatorCols = alignments.map((align) => {
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    return '---';
  });
  const separatorMd = `| ${separatorCols.join(' | ')} |`;

  // Body rows
  const bodyRows = tableData.slice(1);
  const bodyMd = bodyRows.map((r) => `| ${r.join(' | ')} |`).join('\n');

  return bodyMd ? `\n\n${headerMd}\n${separatorMd}\n${bodyMd}\n\n` : `\n\n${headerMd}\n${separatorMd}\n\n`;
}

function cleanCellText(cell: Element): string {
  // Replace line breaks inside table cells with <br> to keep table structure intact
  const clones = cell.cloneNode(true) as Element;
  clones.querySelectorAll('br').forEach((b) => b.replaceWith(' '));
  let text = clones.textContent || '';
  text = text.replace(/[\r\n\t]+/g, ' ').replace(/\|/g, '\\|').trim();
  return text || ' ';
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || !url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function cleanMarkdownWhitespace(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    // Remove 3+ consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing spaces on lines
    .replace(/[ \t]+$/gm, '')
    .trim();
}
