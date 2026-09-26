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
  highlight?: boolean;
  color?: string;
  linkRId?: string;
}

/**
 * Preprocess Markdown:
 * 1. Protect range expressions like `1~1440` from being falsely parsed as strike-through (`<del>`).
 *    In GFM, double tilde `~~deleted~~` is strike-through, but Marked treats single tilde `~` as strike too.
 * 2. Normalize Unicode bullet points (`•`, `●`, `▪`, `◦`) to standard Markdown `- ` bullets.
 */
function preprocessMarkdown(markdown: string): string {
  const STRIKE_TOKEN = '___MARKDOWN_STRIKE_DOUBLE_TILDE___';
  let text = markdown.replace(/\r\n/g, '\n');

  // Protect intentional ~~strikethrough~~
  text = text.replace(/~~/g, STRIKE_TOKEN);
  // Neutralize remaining single ~ by converting to HTML entity so Marked never strikes out ranges like 1~1440
  text = text.replace(/~/g, '&#126;');
  // Restore double tildes
  text = text.replace(new RegExp(STRIKE_TOKEN, 'g'), '~~');

  // Normalize Unicode bullets at start of line
  text = text.replace(/^[•●▪◦]\s*/gm, '- ');

  return text;
}

/**
 * Convert Markdown string into a native, commercial-grade OpenXML (.docx) binary Uint8Array.
 */
export function generateDocxBytes(markdown: string, title = 'Lumina Document'): Uint8Array {
  const normalized = preprocessMarkdown(markdown);
  const html = marked.parse(normalized, { async: false, gfm: true, breaks: true }) as string;
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

  const renderRun = (text: string, fmt: RunFormat = {}): string => {
    if (!text) return '';
    const rPr: string[] = [];

    if (fmt.code) {
      // Explicit inline code: Consolas monospace, 10pt, clean gray pill shading
      rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>');
      rPr.push('<w:sz w:val="20"/><w:szCs w:val="20"/>');
      rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>');
      rPr.push('<w:color w:val="0F172A"/>');
    } else {
      // Standard commercial body font: Microsoft YaHei across Latin and East Asia for consistent metrics
      rPr.push('<w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:cs="Microsoft YaHei"/>');
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

  const renderInlineNodes = (nodes: NodeListOf<ChildNode> | ChildNode[], fmt: RunFormat = {}): string => {
    let out = '';
    Array.from(nodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += renderRun(node.textContent || '', fmt);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') {
          out += renderInlineNodes(el.childNodes, { ...fmt, bold: true, color: fmt.color || '0F172A' });
        } else if (tag === 'em' || tag === 'i') {
          out += renderInlineNodes(el.childNodes, { ...fmt, italic: true });
        } else if (tag === 'del' || tag === 's') {
          out += renderInlineNodes(el.childNodes, { ...fmt, strike: true });
        } else if (tag === 'mark') {
          out += renderInlineNodes(el.childNodes, { ...fmt, highlight: true });
        } else if (tag === 'code') {
          out += renderRun(el.textContent || '', { ...fmt, code: true });
        } else if (tag === 'a') {
          const href = el.getAttribute('href') || '';
          if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
            const rId = registerHyperlink(href);
            out += renderInlineNodes(el.childNodes, { ...fmt, linkRId: rId });
          } else {
            out += renderInlineNodes(el.childNodes, fmt);
          }
        } else if (tag === 'br') {
          out += '<w:r><w:br/></w:r>';
        } else if (tag === 'input' && el.getAttribute('type') === 'checkbox') {
          const checked = el.hasAttribute('checked');
          out += renderRun(checked ? '☑ ' : '☐ ', { ...fmt, bold: true, color: checked ? '10B981' : '64748B' });
        } else if (tag === 'img') {
          const alt = el.getAttribute('alt') || '图表';
          out += renderRun(`[🖼️ ${alt}]`, { ...fmt, color: '64748B', italic: true });
        } else {
          out += renderInlineNodes(el.childNodes, fmt);
        }
      }
    });
    return out;
  };

  /**
   * Split a sequence of inline childNodes by `<br>` tags into distinct logical lines.
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
    return groups.filter((g) =>
      g.some((n) => (n.textContent || '').trim().length > 0 || n.nodeType === Node.ELEMENT_NODE)
    );
  };

  /**
   * Render list item (bullet or numbered) with Word-native numbering.xml and
   * proper indentation on continuation lines.
   */
  const renderListElement = (listEl: HTMLElement, level = 0): string => {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const numId = isOrdered ? 2 : 1;
    const ilvl = Math.min(level, 2);
    const leftIndent = 480 * (ilvl + 1);
    let out = '';

    const items = Array.from(listEl.children).filter((c) => c.tagName.toLowerCase() === 'li');
    items.forEach((li) => {
      // Gather lines inside this li (whether wrapped in <p> or separated by <br>)
      const directNodes = Array.from(li.childNodes);
      const childParagraphs = Array.from(li.children).filter((c) => c.tagName.toLowerCase() === 'p');

      const allLineSegments: ChildNode[][] = [];

      if (childParagraphs.length > 0) {
        childParagraphs.forEach((p) => {
          const segs = splitNodesByBr(Array.from(p.childNodes));
          allLineSegments.push(...segs);
        });
      } else {
        const segs = splitNodesByBr(directNodes);
        allLineSegments.push(...segs);
      }

      if (allLineSegments.length === 0) {
        allLineSegments.push(directNodes);
      }

      // Render first line with Word bullet/numbering
      // Render subsequent lines as indented continuation paragraphs aligned with text
      allLineSegments.forEach((segNodes, segIdx) => {
        const isFirst = segIdx === 0;
        const isLast = segIdx === allLineSegments.length - 1;
        const spacingAfter = isLast ? 100 : 40;

        if (isFirst) {
          out += `<w:p>
            <w:pPr>
              <w:pStyle w:val="ListParagraph"/>
              <w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>
              <w:spacing w:before="40" w:after="${spacingAfter}" w:line="288" w:lineRule="auto"/>
              <w:jc w:val="both"/>
            </w:pPr>
            ${renderInlineNodes(segNodes)}
          </w:p>`;
        } else {
          out += `<w:p>
            <w:pPr>
              <w:pStyle w:val="ListParagraph"/>
              <w:ind w:left="${leftIndent}"/>
              <w:spacing w:before="20" w:after="${spacingAfter}" w:line="288" w:lineRule="auto"/>
              <w:jc w:val="both"/>
            </w:pPr>
            ${renderInlineNodes(segNodes)}
          </w:p>`;
        }
      });
    });

    return out;
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
          <w:spacing w:before="${level === 1 ? 360 : level === 2 ? 280 : 200}" w:after="${level <= 2 ? 140 : 80}"/>
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

      // Section lead label (e.g. `规则：`, `说明：`, `参数要求：`)
      if (/^[^\n：:]{2,14}[：:]$/.test(rawText)) {
        return `<w:p>
          <w:pPr>
            <w:keepNext/>
            <w:spacing w:before="200" w:after="80" w:line="288" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderRun(rawText, { bold: true, color: '0F172A' })}
        </w:p>`;
      }

      const segments = splitNodesByBr(Array.from(el.childNodes));
      if (segments.length <= 1) {
        return `<w:p>
          <w:pPr>
            <w:spacing w:before="40" w:after="120" w:line="288" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderInlineNodes(el.childNodes)}
        </w:p>`;
      }

      return segments
        .map(
          (seg, idx) => `<w:p>
          <w:pPr>
            <w:spacing w:before="20" w:after="${idx === segments.length - 1 ? 120 : 60}" w:line="288" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderInlineNodes(seg)}
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
          <w:spacing w:before="120" w:after="120" w:line="288" w:lineRule="auto"/>
          <w:ind w:left="360" w:right="240"/>
          <w:jc w:val="both"/>
          <w:pBdr>
            <w:left w:val="single" w:sz="24" w:space="12" w:color="${borderColor}"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="${bgFill}"/>
        </w:pPr>
        ${badgeTitle ? renderRun(badgeTitle, { bold: true, color: borderColor }) : ''}
        ${renderRun(cleanedText, { color: '334155' })}
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
          <w:spacing w:before="120" w:after="120" w:line="280" w:lineRule="auto"/>
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

    // Lists
    if (tag === 'ul' || tag === 'ol') {
      return renderListElement(el, 0);
    }

    // Tables
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

    return `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>${renderInlineNodes(el.childNodes)}</w:p>`;
  };

  let bodyXml = '';
  Array.from(root.children).forEach((child) => {
    bodyXml += renderBlockElement(child as HTMLElement);
  });

  if (!bodyXml) {
    bodyXml = `<w:p>${renderRun(markdown)}</w:p>`;
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
  <!-- Abstract Num 0: Word Standard Multi-level Bullet List with Explicit Tab Stops -->
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:tabs><w:tab w:val="num" w:pos="480"/></w:tabs>
        <w:ind w:left="480" w:hanging="480"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="◦"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:tabs><w:tab w:val="num" w:pos="960"/></w:tabs>
        <w:ind w:left="960" w:hanging="480"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/>
        <w:color w:val="334155"/>
      </w:rPr>
    </w:lvl>
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="▪"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:tabs><w:tab w:val="num" w:pos="1440"/></w:tabs>
        <w:ind w:left="1440" w:hanging="480"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:hint="default"/>
        <w:color w:val="475569"/>
      </w:rPr>
    </w:lvl>
  </w:abstractNum>
  <!-- Abstract Num 1: Word Standard Ordered Numbered List -->
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:tabs><w:tab w:val="num" w:pos="480"/></w:tabs>
        <w:ind w:left="480" w:hanging="480"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
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
        <w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:cs="Microsoft YaHei"/>
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
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:ind w:left="480"/>
      <w:contextualSpacing/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1E293B"/></w:rPr>
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
