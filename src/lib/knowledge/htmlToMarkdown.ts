import { normalizeCjkEmphasis } from '../pangu';

/**
 * Specialized HTML to Markdown converter for Lumina Edit Pro
 * Supports GFM tables, nested lists, tasklists, callouts, math formulas, and code blocks.
 */

export interface HtmlToMarkdownOptions {
  baseUrl?: string;
  preserveImages?: boolean;
}

/**
 * Checks whether an image src is an empty placeholder, 1x1 gif, or transparent spacer
 */
export function isPlaceholderImage(src?: string | null): boolean {
  if (!src) return true;
  const s = src.trim();
  if (/^(?:javascript:|about:blank)/i.test(s)) return true;
  if (/none\.(gif|png|jpe?g)|blank\.(gif|png)|pixel\.(gif|png)|spacer\.(gif|png)|transparent\.(gif|png)/i.test(s)) return true;
  if (s.startsWith('data:image/svg+xml;base64,PHN2Zy')) return true;
  if (s.includes('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')) return true;
  if (/^data:image\/(?:gif|png|jpe?g);base64,[A-Za-z0-9+/=]{1,80}$/i.test(s)) return true;
  return false;
}

/**
 * Extracts the effective image URL from an img element, checking lazy-loading attributes
 * (such as zoomfile, file, data-src, data-original) before falling back to src.
 */
export function getEffectiveImgSrc(el: Element): string {
  const lazyAttrs = [
    'zoomfile',
    'file',
    'data-original',
    'data-src',
    'data-original-src',
    'data-actualsrc',
    'data-url',
    'data-lazy-src',
    'data-echo',
  ];
  for (const attr of lazyAttrs) {
    const val = el.getAttribute(attr);
    if (val && !isPlaceholderImage(val)) {
      return val.trim();
    }
  }
  const src = el.getAttribute('src');
  if (src && !isPlaceholderImage(src)) {
    return src.trim();
  }
  return '';
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

  // Check hidden elements and anti-crawler watermarks / jammers
  const style = el.getAttribute('style') || '';
  const className = el.getAttribute('class') || '';
  if (
    /display\s*:\s*none/i.test(style) ||
    /visibility\s*:\s*hidden/i.test(style) ||
    /font-size\s*:\s*0(?:px)?/i.test(style) ||
    /color\s*:\s*transparent/i.test(style) ||
    /opacity\s*:\s*0(?:\.0+)?(?:\s*;|$)/i.test(style) ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.getAttribute('size') === '0' ||
    className.includes('jammer') ||
    className.includes('aimg_tip')
  ) {
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

  // Strong / Bold (tag or font-weight style)
  const isBold = ['strong', 'b'].includes(tag) || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
  if (isBold) {
    const inner = processChildren(el, ctx).trim();
    return inner ? `**${inner}**` : '';
  }

  // Emphasis / Italic (tag or font-style)
  const isItalic = ['em', 'i'].includes(tag) || /font-style\s*:\s*italic/i.test(style);
  if (isItalic) {
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

    const src = getEffectiveImgSrc(el);
    if (!src) return '';

    const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
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
    if (isLayoutTable(el)) {
      return processChildren(el, ctx);
    }
    return processTable(el, ctx);
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

function isLayoutTable(table: Element): boolean {
  const role = table.getAttribute('role');
  if (role === 'presentation') return true;

  const className = table.getAttribute('class') || '';
  if (/layout|t_fsz/i.test(className)) return true;

  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return true;

  const allCells = Array.from(table.querySelectorAll('th, td'));
  if (allCells.length <= 1) return true;

  // If any cell contains block-level elements that Markdown tables cannot represent
  for (const cell of allCells) {
    if (cell.classList.contains('t_f') || cell.getAttribute('id')?.startsWith('postmessage_')) {
      return true;
    }
    const hasBlockElements = cell.querySelector('h1, h2, h3, h4, h5, h6, pre, blockquote, hr, table, ul, ol');
    if (hasBlockElements) return true;
    const pCount = cell.querySelectorAll('p').length;
    if (pCount > 1) return true;
  }

  return false;
}

function processTable(table: Element, ctx: Context): string {
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
      const cellText = cleanCellText(cell, ctx.baseUrl);
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

function cleanCellText(cell: Element, baseUrl?: string): string {
  // Replace line breaks inside table cells with space to keep table structure intact
  const clones = cell.cloneNode(true) as Element;
  // Remove hidden and jammer elements
  clones
    .querySelectorAll(
      '[style*="display:none"], [style*="display: none"], [style*="font-size:0"], .jammer, .aimg_tip, [aria-hidden="true"]'
    )
    .forEach((e) => e.remove());
  clones.querySelectorAll('br').forEach((b) => b.replaceWith(' '));
  // Convert any inline images to markdown images if present
  clones.querySelectorAll('img').forEach((img) => {
    const src = getEffectiveImgSrc(img);
    if (src) {
      const alt = img.getAttribute('alt') || '';
      const resolved = resolveUrl(src, baseUrl);
      const textNode = clones.ownerDocument.createTextNode(` ![${alt}](${resolved}) `);
      img.replaceWith(textNode);
    } else {
      img.remove();
    }
  });
  let text = clones.textContent || '';
  text = text.replace(/[\r\n\t]+/g, ' ').replace(/\|/g, '\\|').trim();
  return text || ' ';
}

export function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || !url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function cleanMarkdownWhitespace(md: string): string {
  const cleaned = md
    .replace(/\r\n/g, '\n')
    // Remove 3+ consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing spaces on lines
    .replace(/[ \t]+$/gm, '')
    .trim();

  return normalizeCjkEmphasis(cleaned);
}
