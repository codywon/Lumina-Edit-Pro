import { marked } from 'marked';
import { extractDocumentBaseName, saveExportedBytes } from './exportSave';

/**
 * Pure TypeScript PKZIP Builder (Store method, 0 external dependencies)
 * Generates standard ZIP binary archives for OpenXML (.docx) files.
 */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZipArchive(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralHeaders.reduce((acc, arr) => acc + arr.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + 22;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of localHeaders) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralHeaders) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(eocd, pos);
  return out;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface RunFormat {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  techToken?: boolean;
  highlight?: boolean;
  color?: string;
  linkRId?: string;
}

/**
 * Regex for technical identifiers embedded in prose (e.g. `config_revision`, `bed_slots[]`,
 * `interference_regions[0..3]`, `offset_*`, `0x0A04`, `radar_z_min/max`).
 * Renders them with crisp Consolas monospace font without garish orange text.
 */
const TECH_IDENTIFIER_REGEX =
  /([a-zA-Z_][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9_*]+)*(?:\[\d*(?:\.\.\d+)?\]|\*)?|0x[0-9a-fA-F]+)/g;

function isLikelyTechnicalToken(token: string): boolean {
  if (token.includes('_') || token.includes('[') || token.includes('*') || token.startsWith('0x')) {
    return true;
  }
  // Common camelCase or technical protocol/status keywords in technical specs
  if (/^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(token)) {
    return true;
  }
  if (/^(received|persisted|applied|rejected|stale|present|empty|full|lite|compact|string|int|uint32|float|bool|JSON|MQTT|UART|NVS|ESP32|LD6004)$/i.test(token)) {
    return true;
  }
  return false;
}

/**
 * Detect whether a paragraph/list item starts with a Lead-in Definition Term:
 * e.g. `阈值约束：...`, `区域约束：...`, `上报模式（可选，schema v5 追加字段，旧固件忽略）：...`, `处理流程：...`
 */
function splitLeadInTerm(text: string): { leadIn: string; rest: string } | null {
  const match = text.match(/^([^\n：:]{2,28}[：:])(\s*[\s\S]*)$/);
  if (!match) return null;
  const candidate = match[1];
  // Avoid matching URLs like http: or https:
  if (/https?:$/i.test(candidate)) return null;
  // Ensure the lead-in phrase is concise (excluding parenthetical notes)
  const corePhrase = candidate.replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[：:]$/, '').trim();
  if (corePhrase.length >= 2 && corePhrase.length <= 16) {
    return { leadIn: candidate, rest: match[2] };
  }
  return null;
}

/**
 * Pre-process raw Markdown to normalize Unicode bullet lists (`• `, `● `, `▪ `) and
 * preserve multi-paragraph list continuations so AST structure is 100% faithful.
 */
function preprocessMarkdownForCommercialLayout(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];
  let inBulletRegion = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check if line starts with Unicode bullet (`•`, `●`, `▪`, `◦`) or standard Markdown bullet (`- `, `* `)
    const unicodeBulletMatch = trimmed.match(/^[•●▪◦]\s*(.+)$/);
    const stdBulletMatch = rawLine.match(/^(\s*[-*+]|\s*\d+\.)\s+(.+)$/);

    if (unicodeBulletMatch) {
      inBulletRegion = true;
      result.push(`- ${unicodeBulletMatch[1]}`);
      continue;
    }

    if (stdBulletMatch) {
      inBulletRegion = true;
      result.push(rawLine);
      continue;
    }

    // Check if this line breaks out of a list region (headings, tables, code fences, blockquotes, horizontal rules, or standalone section label like `规则：`)
    if (
      /^#{1,6}\s/.test(trimmed) ||
      /^```/.test(trimmed) ||
      /^\|/.test(trimmed) ||
      /^>\s/.test(trimmed) ||
      /^---+$/.test(trimmed) ||
      (/^[^\n：:]{2,12}[：:]$/.test(trimmed) && !inBulletRegion)
    ) {
      inBulletRegion = false;
      result.push(rawLine);
      continue;
    }

    // If we are inside a bullet list region and encounter a non-empty line that does NOT start with a bullet:
    // Check if it's a continuation sub-paragraph of the current bullet item!
    if (inBulletRegion && trimmed.length > 0) {
      // Look ahead: if this line follows a bullet item (even across a single blank line when subsequent lines also belong to the rule block or another bullet follows)
      // We indent it by 2 spaces as a distinct sub-paragraph (`\n\n  ...`) so Marked AST attaches it as a child paragraph of the current `list_item`!
      const prevLine = result.length > 0 ? result[result.length - 1] : '';
      if (prevLine.trim() !== '') {
        result.push('');
      }
      result.push(`  ${trimmed}`);
      continue;
    }

    result.push(rawLine);
  }

  return result.join('\n');
}

/**
 * Convert Markdown string into a native OpenXML 2.0 (.docx) binary Uint8Array
 * with commercial-grade whitepaper typography.
 */
export function generateDocxBytes(markdown: string, title = 'Lumina Document'): Uint8Array {
  const normalizedMarkdown = preprocessMarkdownForCommercialLayout(markdown);
  const html = marked.parse(normalizedMarkdown, { async: false, gfm: true, breaks: true }) as string;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  const relationships: { id: string; type: string; target: string; external?: boolean }[] = [
    {
      id: 'rId1',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
      target: 'styles.xml',
    },
    {
      id: 'rId2',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
      target: 'numbering.xml',
    },
  ];
  let nextRelId = 3;

  const registerHyperlink = (href: string): string => {
    const id = `rId${nextRelId++}`;
    relationships.push({
      id,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
      target: href,
      external: true,
    });
    return id;
  };

  const renderSingleRun = (text: string, fmt: RunFormat = {}): string => {
    if (!text) return '';
    const rPr: string[] = [];

    if (fmt.code) {
      // Explicit inline code (`code`): slate navy monospace pill
      rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>');
      rPr.push('<w:sz w:val="19.5"/><w:szCs w:val="19.5"/>');
      rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>');
      rPr.push('<w:color w:val="0F172A"/>');
    } else if (fmt.techToken) {
      // Auto-detected technical identifier in prose: clean Consolas monospace, deep slate color
      rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>');
      rPr.push('<w:sz w:val="20"/><w:szCs w:val="20"/>');
      rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>');
      rPr.push(`<w:color w:val="${fmt.color || '0F172A'}"/>`);
    } else {
      rPr.push('<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/>');
      if (fmt.color) {
        rPr.push(`<w:color w:val="${fmt.color}"/>`);
      }
    }

    if (fmt.bold) rPr.push('<w:b/><w:bCs/>');
    if (fmt.italic) rPr.push('<w:i/><w:iCs/>');
    if (fmt.strike) rPr.push('<w:strike/>');
    if (fmt.highlight) rPr.push('<w:highlight w:val="yellow"/>');
    if (fmt.linkRId) {
      rPr.push('<w:color w:val="2563EB"/><w:u w:val="single"/>');
    }

    const lines = text.split('\n');
    const inner = lines
      .map((line, idx) => `${idx > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
      .join('');

    const runXml = `<w:r><w:rPr>${rPr.join('')}</w:rPr>${inner}</w:r>`;
    if (fmt.linkRId) {
      return `<w:hyperlink r:id="${fmt.linkRId}">${runXml}</w:hyperlink>`;
    }
    return runXml;
  };

  /**
   * Render text with automatic micro-typography for technical tokens (`config_revision`, `bed_slots[]`, etc.)
   */
  const renderProseTextWithTechTokens = (text: string, fmt: RunFormat = {}): string => {
    if (!text) return '';
    if (fmt.code || fmt.bold) {
      return renderSingleRun(text, fmt);
    }

    let out = '';
    let lastIndex = 0;
    TECH_IDENTIFIER_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TECH_IDENTIFIER_REGEX.exec(text)) !== null) {
      const token = match[0];
      const index = match.index;
      if (isLikelyTechnicalToken(token)) {
        if (index > lastIndex) {
          out += renderSingleRun(text.slice(lastIndex, index), fmt);
        }
        out += renderSingleRun(token, { ...fmt, techToken: true });
        lastIndex = index + token.length;
      }
    }

    if (lastIndex < text.length) {
      out += renderSingleRun(text.slice(lastIndex), fmt);
    }
    return out;
  };

  const renderInlineNodes = (
    nodes: NodeListOf<ChildNode> | ChildNode[],
    fmt: RunFormat = {},
    enableLeadInHighlight = false
  ): string => {
    const nodeList = Array.from(nodes);
    let out = '';
    let leadInChecked = !enableLeadInHighlight;

    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const rawText = node.textContent || '';
        if (!leadInChecked && rawText.trim().length > 0) {
          leadInChecked = true;
          const split = splitLeadInTerm(rawText);
          if (split) {
            out += renderSingleRun(split.leadIn, { ...fmt, bold: true, color: '0F172A' });
            out += renderProseTextWithTechTokens(split.rest, fmt);
            continue;
          }
        }
        out += renderProseTextWithTechTokens(rawText, fmt);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        leadInChecked = true;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') {
          out += renderInlineNodes(el.childNodes, { ...fmt, bold: true, color: fmt.color || '0F172A' }, false);
        } else if (tag === 'em' || tag === 'i') {
          out += renderInlineNodes(el.childNodes, { ...fmt, italic: true }, false);
        } else if (tag === 'del' || tag === 's') {
          out += renderInlineNodes(el.childNodes, { ...fmt, strike: true }, false);
        } else if (tag === 'mark') {
          out += renderInlineNodes(el.childNodes, { ...fmt, highlight: true }, false);
        } else if (tag === 'code') {
          out += renderSingleRun(el.textContent || '', { ...fmt, code: true });
        } else if (tag === 'a') {
          const href = el.getAttribute('href') || '';
          if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
            const rId = registerHyperlink(href);
            out += renderInlineNodes(el.childNodes, { ...fmt, linkRId: rId }, false);
          } else {
            out += renderInlineNodes(el.childNodes, fmt, false);
          }
        } else if (tag === 'br') {
          out += '<w:r><w:br/></w:r>';
        } else if (tag === 'input' && el.getAttribute('type') === 'checkbox') {
          const checked = el.hasAttribute('checked');
          out += renderSingleRun(checked ? '☑ ' : '☐ ', { ...fmt, bold: true, color: checked ? '10B981' : '64748B' });
        } else if (tag === 'img') {
          const alt = el.getAttribute('alt') || '图表';
          out += renderSingleRun(`[🖼️ ${alt}]`, { ...fmt, color: '64748B', italic: true });
        } else {
          out += renderInlineNodes(el.childNodes, fmt, false);
        }
      }
    }
    return out;
  };

  /**
   * Render a list (<ul> or <ol>) using Word's native numbering.xml (`w:numPr`)
   * and properly indenting multi-paragraph continuations inside any `<li>`!
   */
  const renderListElement = (listEl: HTMLElement, level = 0): string => {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const numId = isOrdered ? 2 : 1;
    const ilvl = Math.min(level, 2);
    const leftIndent = 420 * (ilvl + 1);
    let out = '';

    const items = Array.from(listEl.children).filter((c) => c.tagName.toLowerCase() === 'li');
    items.forEach((li) => {
      const childElements = Array.from(li.children);
      const hasBlockChildren = childElements.some((c) =>
        ['p', 'ul', 'ol', 'pre', 'blockquote', 'table'].includes(c.tagName.toLowerCase())
      );

      if (!hasBlockChildren) {
        // Single-block list item (check if it contains <br> line breaks that should be rendered as clean continuation paragraphs)
        const segments = splitNodesByBr(Array.from(li.childNodes));
        segments.forEach((segNodes, segIdx) => {
          const isFirstSeg = segIdx === 0;
          const isLastSeg = segIdx === segments.length - 1;
          const afterSpacing = isLastSeg ? 120 : 60;
          if (isFirstSeg) {
            out += `<w:p>
              <w:pPr>
                <w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>
                <w:spacing w:before="40" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                <w:jc w:val="both"/>
              </w:pPr>
              ${renderInlineNodes(segNodes, {}, true)}
            </w:p>`;
          } else {
            // Continuation paragraph aligned with the bullet's text start
            out += `<w:p>
              <w:pPr>
                <w:ind w:left="${leftIndent}"/>
                <w:spacing w:before="20" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                <w:jc w:val="both"/>
              </w:pPr>
              ${renderInlineNodes(segNodes, {}, true)}
            </w:p>`;
          }
        });
        return;
      }

      // Multi-block list item (e.g. contains multiple <p> or nested <ul>/<ol>)
      let emittedFirstBullet = false;
      const childNodes = Array.from(li.childNodes);
      let inlineBuffer: ChildNode[] = [];

      const flushInlineBuffer = (isLast: boolean) => {
        if (inlineBuffer.length === 0) return;
        const text = inlineBuffer.map((n) => n.textContent || '').join('').trim();
        if (!text) {
          inlineBuffer = [];
          return;
        }
        const segments = splitNodesByBr(inlineBuffer);
        segments.forEach((segNodes, segIdx) => {
          const afterSpacing = isLast && segIdx === segments.length - 1 ? 120 : 60;
          if (!emittedFirstBullet) {
            emittedFirstBullet = true;
            out += `<w:p>
              <w:pPr>
                <w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>
                <w:spacing w:before="40" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                <w:jc w:val="both"/>
              </w:pPr>
              ${renderInlineNodes(segNodes, {}, true)}
            </w:p>`;
          } else {
            out += `<w:p>
              <w:pPr>
                <w:ind w:left="${leftIndent}"/>
                <w:spacing w:before="20" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                <w:jc w:val="both"/>
              </w:pPr>
              ${renderInlineNodes(segNodes, {}, true)}
            </w:p>`;
          }
        });
        inlineBuffer = [];
      };

      childNodes.forEach((child, idx) => {
        const isLastChild = idx === childNodes.length - 1;
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as HTMLElement;
          const cTag = childEl.tagName.toLowerCase();
          if (cTag === 'p') {
            flushInlineBuffer(false);
            const segments = splitNodesByBr(Array.from(childEl.childNodes));
            segments.forEach((segNodes, segIdx) => {
              const afterSpacing = isLastChild && segIdx === segments.length - 1 ? 120 : 60;
              if (!emittedFirstBullet) {
                emittedFirstBullet = true;
                out += `<w:p>
                  <w:pPr>
                    <w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>
                    <w:spacing w:before="40" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  ${renderInlineNodes(segNodes, {}, true)}
                </w:p>`;
              } else {
                out += `<w:p>
                  <w:pPr>
                    <w:ind w:left="${leftIndent}"/>
                    <w:spacing w:before="20" w:after="${afterSpacing}" w:line="332" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  ${renderInlineNodes(segNodes, {}, true)}
                </w:p>`;
              }
            });
          } else if (cTag === 'ul' || cTag === 'ol') {
            flushInlineBuffer(false);
            out += renderListElement(childEl, level + 1);
          } else {
            flushInlineBuffer(false);
            out += renderBlockElement(childEl);
          }
        } else {
          inlineBuffer.push(child);
        }
      });
      flushInlineBuffer(true);
    });

    return out;
  };

  /**
   * Helper to split a sequence of inline ChildNodes by `<br>` elements so each line
   * inside a paragraph/bullet becomes a clean, properly spaced paragraph in Word.
   */
  const splitNodesByBr = (nodes: ChildNode[]): ChildNode[][] => {
    const groups: ChildNode[][] = [];
    let current: ChildNode[] = [];

    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'br') {
        if (current.length > 0) {
          groups.push(current);
          current = [];
        }
      } else {
        current.push(node);
      }
    }
    if (current.length > 0) {
      groups.push(current);
    }
    return groups.filter((g) => g.some((n) => (n.textContent || '').trim().length > 0 || n.nodeType === Node.ELEMENT_NODE));
  };

  const renderBlockElement = (el: HTMLElement): string => {
    const tag = el.tagName.toLowerCase();

    // Headings H1 ~ H6
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag.slice(1), 10);
      const align = el.getAttribute('align') || el.style.textAlign || '';
      const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : '';
      const bottomBorder =
        level === 1
          ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="CBD5E1"/></w:pBdr>'
          : level === 2
          ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="E2E8F0"/></w:pBdr>'
          : '';
      return `<w:p>
        <w:pPr>
          <w:pStyle w:val="Heading${level}"/>
          <w:keepNext/>
          <w:keepLines/>
          <w:outlineLvl w:val="${level - 1}"/>
          <w:spacing w:before="${level === 1 ? 360 : level === 2 ? 280 : 220}" w:after="${level <= 2 ? 140 : 100}"/>
          ${jc}
          ${bottomBorder}
        </w:pPr>
        ${renderInlineNodes(el.childNodes, { bold: true, color: '0F172A' })}
      </w:p>`;
    }

    // Paragraph or Div
    if (tag === 'p' || tag === 'div') {
      const rawText = (el.textContent || '').trim();
      const align = el.getAttribute('align') || el.style.textAlign || '';
      const jc =
        align === 'center'
          ? '<w:jc w:val="center"/>'
          : align === 'right'
          ? '<w:jc w:val="right"/>'
          : '<w:jc w:val="both"/>';

      // Check if this paragraph is a concise section lead label (e.g. `规则：`, `说明：`, `参数要求：`)
      if (/^[^\n：:]{2,14}[：:]$/.test(rawText)) {
        return `<w:p>
          <w:pPr>
            <w:keepNext/>
            <w:spacing w:before="200" w:after="80" w:line="332" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderSingleRun(rawText, { bold: true, color: '0F172A' })}
        </w:p>`;
      }

      const segments = splitNodesByBr(Array.from(el.childNodes));
      if (segments.length <= 1) {
        return `<w:p>
          <w:pPr>
            <w:spacing w:before="60" w:after="140" w:line="332" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderInlineNodes(el.childNodes, {}, true)}
        </w:p>`;
      }

      return segments
        .map(
          (seg, idx) => `<w:p>
          <w:pPr>
            <w:spacing w:before="40" w:after="${idx === segments.length - 1 ? 140 : 80}" w:line="332" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderInlineNodes(seg, {}, true)}
        </w:p>`
        )
        .join('');
    }

    // Blockquote & Callouts
    if (tag === 'blockquote') {
      const rawText = (el.textContent || '').trim();
      const calloutMatch = rawText.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i);
      let borderColor = '64748B';
      let bgFill = 'F8FAFC';
      let badgeTitle = '';

      if (calloutMatch) {
        const type = calloutMatch[1].toUpperCase();
        if (type === 'NOTE') {
          borderColor = '3B82F6';
          bgFill = 'EFF6FF';
          badgeTitle = 'ℹ️ 说明 (NOTE)：';
        } else if (type === 'TIP') {
          borderColor = '10B981';
          bgFill = 'ECFDF5';
          badgeTitle = '💡 技巧 (TIP)：';
        } else if (type === 'WARNING') {
          borderColor = 'F59E0B';
          bgFill = 'FFFBEB';
          badgeTitle = '⚠️ 警告 (WARNING)：';
        } else if (type === 'IMPORTANT') {
          borderColor = '8B5CF6';
          bgFill = 'F5F3FF';
          badgeTitle = '🔔 重要 (IMPORTANT)：';
        } else if (type === 'CAUTION') {
          borderColor = 'EF4444';
          bgFill = 'FEF2F2';
          badgeTitle = '🚨 危险 (CAUTION)：';
        }
      }

      const cleanedText = calloutMatch ? rawText.replace(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/i, '') : rawText;

      return `<w:p>
        <w:pPr>
          <w:spacing w:before="140" w:after="140" w:line="332" w:lineRule="auto"/>
          <w:ind w:left="360" w:right="240"/>
          <w:jc w:val="both"/>
          <w:pBdr>
            <w:left w:val="single" w:sz="24" w:space="12" w:color="${borderColor}"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="${bgFill}"/>
        </w:pPr>
        ${badgeTitle ? renderSingleRun(badgeTitle, { bold: true, color: borderColor }) : ''}
        ${renderProseTextWithTechTokens(cleanedText, { color: '334155' })}
      </w:p>`;
    }

    // CodeBlock
    if (tag === 'pre') {
      const codeEl = el.querySelector('code');
      const codeText = (codeEl ? codeEl.textContent : el.textContent) || '';
      const lines = codeText.replace(/\n$/, '').split('\n');
      const runs = lines
        .map(
          (line, idx) =>
            `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="19"/><w:color w:val="0F172A"/></w:rPr>${
              idx > 0 ? '<w:br/>' : ''
            }<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
        )
        .join('');

      return `<w:p>
        <w:pPr>
          <w:spacing w:before="140" w:after="140" w:line="280" w:lineRule="auto"/>
          <w:ind w:left="200" w:right="200"/>
          <w:jc w:val="left"/>
          <w:pBdr>
            <w:top w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:bottom w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:left w:val="single" w:sz="16" w:space="8" w:color="64748B"/>
            <w:right w:val="single" w:sz="4" w:space="8" w:color="CBD5E1"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
        </w:pPr>
        ${runs}
      </w:p>`;
    }

    // Unordered & Ordered Lists
    if (tag === 'ul' || tag === 'ol') {
      return renderListElement(el, 0);
    }

    // Tables (Word-grade Grid & Header Styling)
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let rowsXml = '';
      rows.forEach((tr, rowIdx) => {
        const cells = Array.from(tr.children).filter(
          (c) => c.tagName.toLowerCase() === 'th' || c.tagName.toLowerCase() === 'td'
        );
        const isHeaderRow = rowIdx === 0 || cells.some((c) => c.tagName.toLowerCase() === 'th');

        let cellsXml = '';
        cells.forEach((cell) => {
          const cellEl = cell as HTMLElement;
          const align = cellEl.getAttribute('align') || cellEl.style.textAlign || 'left';
          const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : '<w:jc w:val="left"/>';
          const shd = isHeaderRow
            ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>'
            : rowIdx % 2 === 1
            ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>'
            : '<w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>';

          const bottomBdr = isHeaderRow
            ? '<w:bottom w:val="single" w:sz="12" w:space="0" w:color="94A3B8"/>'
            : '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>';

          cellsXml += `<w:tc>
            <w:tcPr>
              <w:tcBorders>
                <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                ${bottomBdr}
                <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              </w:tcBorders>
              ${shd}
              <w:tcMar>
                <w:top w:w="120" w:type="dxa"/>
                <w:bottom w:w="120" w:type="dxa"/>
                <w:left w:w="160" w:type="dxa"/>
                <w:right w:w="160" w:type="dxa"/>
              </w:tcMar>
              <w:vAlign w:val="center"/>
            </w:tcPr>
            <w:p>
              <w:pPr>
                <w:spacing w:before="20" w:after="20" w:line="280" w:lineRule="auto"/>
                ${jc}
              </w:pPr>
              ${renderInlineNodes(cellEl.childNodes, { bold: isHeaderRow, color: isHeaderRow ? '0F172A' : '1E293B' })}
            </w:p>
          </w:tc>`;
        });

        rowsXml += `<w:tr>${isHeaderRow ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cellsXml}</w:tr>`;
      });

      return `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="5000" w:type="pct"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/>
            <w:bottom w:val="single" w:sz="8" w:space="0" w:color="94A3B8"/>
            <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          </w:tblBorders>
          <w:tblLayout w:type="autofit"/>
        </w:tblPr>
        ${rowsXml}
      </w:tbl><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>`;
    }

    // Horizontal Rule
    if (tag === 'hr') {
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="160" w:after="160"/>
          <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CBD5E1"/></w:pBdr>
        </w:pPr>
      </w:p>`;
    }

    return `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>${renderInlineNodes(el.childNodes, {}, true)}</w:p>`;
  };

  let bodyXml = '';
  Array.from(root.children).forEach((child) => {
    bodyXml += renderBlockElement(child as HTMLElement);
  });

  if (!bodyXml) {
    bodyXml = `<w:p>${renderSingleRun(markdown)}</w:p>`;
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships
    .map(
      (r) =>
        `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeXml(r.target)}"${
          r.external ? ' TargetMode="External"' : ''
        }/>`
    )
    .join('\n  ')}
</Relationships>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <!-- Abstract Num 0: Commercial Multi-level Bullet List -->
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="420" w:hanging="240"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:b/><w:color w:val="334155"/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="◦"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="840" w:hanging="240"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:color w:val="475569"/></w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="▪"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1260" w:hanging="240"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:color w:val="64748B"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <!-- Abstract Num 1: Commercial Ordered Numbered List -->
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="420" w:hanging="240"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:b/><w:color w:val="0F172A"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei" w:cs="Segoe UI"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:color w:val="1E293B"/>
        <w:lang w:val="en-US" w:eastAsia="zh-CN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:widowControl/>
        <w:kinsoku/>
        <w:wordWrap/>
        <w:autoSpaceDE w:val="1"/>
        <w:autoSpaceDN w:val="1"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="1E293B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="4"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="334155"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="5"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="475569"/></w:rPr>
  </w:style>
</w:styles>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const encoder = new TextEncoder();
  return buildZipArchive([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(wordRelsXml) },
    { name: 'word/numbering.xml', data: encoder.encode(numberingXml) },
    { name: 'word/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ]);
}

export async function exportMarkdownToDocx(
  markdown: string,
  fileName?: string,
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void
): Promise<void> {
  try {
    const baseName = fileName
      ? fileName.replace(/\.docx$/i, '')
      : extractDocumentBaseName(markdown, 'Lumina-Document');
    const targetFileName = `${baseName}.docx`;
    const bytes = generateDocxBytes(markdown, baseName);

    await saveExportedBytes({
      bytes,
      defaultFileName: targetFileName,
      filterName: 'Microsoft Word 文档 (*.docx)',
      extensions: ['docx'],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      showToast,
      successLabel: ' Word (.docx) 文档',
    });
  } catch (error) {
    console.error('DOCX export error:', error);
    showToast?.('导出 Word 文档失败', 'error');
  }
}
