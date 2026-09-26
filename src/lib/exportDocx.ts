import { marked } from 'marked';
import { extractDocumentBaseName, saveExportedBytes } from './exportSave';
import { EXPORT_THEMES, ExportThemeConfig, ExportThemeId } from './exportThemes';

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
  fontAscii?: string;
  fontEastAsia?: string;
  linkRId?: string;
}

export interface GenerateDocxOptions {
  themeId?: ExportThemeId;
  title?: string;
  author?: string;
  includeHeaderFooter?: boolean;
}

/**
 * Preprocess Markdown:
 * 1. Protect numeric range expressions like `1~1440` from being falsely parsed as strike-through (`<del>`).
 * 2. Normalize Unicode bullet points (`•`, `●`, `▪`, `◦`) to standard Markdown `- ` bullets.
 */
function preprocessMarkdown(markdown: string): string {
  const STRIKE_TOKEN = '___MARKDOWN_STRIKE_DOUBLE_TILDE___';
  let text = markdown.replace(/\r\n/g, '\n');

  text = text.replace(/~~/g, STRIKE_TOKEN);
  text = text.replace(/~/g, '&#126;');
  text = text.replace(new RegExp(STRIKE_TOKEN, 'g'), '~~');

  text = text.replace(/^[•●▪◦]\s*/gm, '- ');
  return text;
}

/**
 * Convert Markdown string into a native OpenXML (.docx) binary Uint8Array
 * with selected commercial/executive theme and Word-native headers & footers.
 */
export function generateDocxBytes(
  markdown: string,
  options: string | GenerateDocxOptions = 'Lumina Document'
): Uint8Array {
  const opts: GenerateDocxOptions =
    typeof options === 'string'
      ? { title: options, themeId: 'report', includeHeaderFooter: true }
      : {
          themeId: options.themeId || 'report',
          title: options.title || extractDocumentBaseName(markdown, 'Lumina Document'),
          author: options.author || 'codywon',
          includeHeaderFooter: options.includeHeaderFooter !== false,
        };

  const theme: ExportThemeConfig = EXPORT_THEMES[opts.themeId || 'report'] || EXPORT_THEMES.report;
  const docTitle = opts.title || extractDocumentBaseName(markdown, 'Lumina Document');

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

  if (opts.includeHeaderFooter) {
    relationships.push({
      id: 'rIdHeader',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header',
      target: 'header1.xml',
    });
    relationships.push({
      id: 'rIdFooter',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
      target: 'footer1.xml',
    });
  }

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
      rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>');
      rPr.push('<w:sz w:val="20"/><w:szCs w:val="20"/>');
      rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>');
      rPr.push('<w:color w:val="0F172A"/>');
    } else {
      const ascii = fmt.fontAscii || theme.fontAscii;
      const eastAsia = fmt.fontEastAsia || theme.fontEastAsia;
      rPr.push(`<w:rFonts w:ascii="${ascii}" w:hAnsi="${ascii}" w:eastAsia="${eastAsia}" w:cs="${ascii}"/>`);
      const color = fmt.color || theme.bodyColor;
      if (color) {
        rPr.push(`<w:color w:val="${color}"/>`);
      }
    }

    if (fmt.bold) rPr.push('<w:b/><w:bCs/>');
    if (fmt.italic) rPr.push('<w:i/><w:iCs/>');
    if (fmt.strike) rPr.push('<w:strike/>');
    if (fmt.highlight) rPr.push('<w:highlight w:val="yellow"/>');
    if (fmt.linkRId) {
      rPr.push(`<w:color w:val="${theme.accentColor}"/><w:u w:val="single"/>`);
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
          out += renderInlineNodes(el.childNodes, { ...fmt, bold: true });
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

  const renderListElement = (listEl: HTMLElement, level = 0): string => {
    const isOrdered = listEl.tagName.toLowerCase() === 'ol';
    const numId = isOrdered ? 2 : 1;
    const ilvl = Math.min(level, 2);
    const leftIndent = 480 * (ilvl + 1);
    let out = '';

    const items = Array.from(listEl.children).filter((c) => c.tagName.toLowerCase() === 'li');
    items.forEach((li) => {
      const directNodes = Array.from(li.childNodes);
      const childParagraphs = Array.from(li.children).filter((c) => c.tagName.toLowerCase() === 'p');

      const allLineSegments: ChildNode[][] = [];
      if (childParagraphs.length > 0) {
        childParagraphs.forEach((p) => {
          allLineSegments.push(...splitNodesByBr(Array.from(p.childNodes)));
        });
      } else {
        allLineSegments.push(...splitNodesByBr(directNodes));
      }

      if (allLineSegments.length === 0) {
        allLineSegments.push(directNodes);
      }

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

  let renderedTopBanner = false;

  const renderBlockElement = (el: HTMLElement, isFirstChild = false): string => {
    const tag = el.tagName.toLowerCase();

    // Headings H1 ~ H6
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag.slice(1), 10);
      const align = el.getAttribute('align') || el.style.textAlign || '';
      const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : '';

      // If theme is 'report' and hasBanner is true, render the first H1 as a high-impact colored Banner!
      if (level === 1 && theme.hasBanner && !renderedTopBanner && isFirstChild) {
        renderedTopBanner = true;
        const h1Text = el.textContent?.trim() || docTitle;
        const now = new Date();
        const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${String(
          now.getHours()
        ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        return `<w:tbl>
          <w:tblPr>
            <w:tblW w:w="5000" w:type="pct"/>
            <w:tblBorders>
              <w:top w:val="none"/>
              <w:bottom w:val="none"/>
              <w:left w:val="none"/>
              <w:right w:val="none"/>
              <w:insideH w:val="none"/>
              <w:insideV w:val="none"/>
            </w:tblBorders>
            <w:tblLayout w:type="autofit"/>
          </w:tblPr>
          <w:tr>
            <w:tc>
              <w:tcPr>
                <w:shd w:val="clear" w:color="auto" w:fill="${theme.bannerBg || 'EC5B13'}"/>
                <w:tcMar>
                  <w:top w:w="480" w:type="dxa"/>
                  <w:bottom w:w="480" w:type="dxa"/>
                  <w:left w:w="360" w:type="dxa"/>
                  <w:right w:w="360" w:type="dxa"/>
                </w:tcMar>
                <w:vAlign w:val="center"/>
              </w:tcPr>
              <w:p>
                <w:pPr>
                  <w:jc w:val="center"/>
                  <w:spacing w:before="60" w:after="60"/>
                  <w:pStyle w:val="Heading1"/>
                  <w:outlineLvl w:val="0"/>
                </w:pPr>
                <w:r>
                  <w:rPr>
                    <w:rFonts w:ascii="${theme.fontHeading || theme.fontEastAsia}" w:eastAsia="${
          theme.fontHeading || theme.fontEastAsia
        }"/>
                    <w:b/><w:bCs/>
                    <w:sz w:val="46"/><w:szCs w:val="46"/>
                    <w:color w:val="${theme.bannerTextColor || 'FFFFFF'}"/>
                  </w:rPr>
                  <w:t xml:space="preserve">${escapeXml(h1Text)}</w:t>
                </w:r>
              </w:p>
            </w:tc>
          </w:tr>
        </w:tbl>
        <w:p>
          <w:pPr>
            <w:spacing w:before="160" w:after="160"/>
            <w:pBdr>
              <w:bottom w:val="single" w:sz="12" w:space="8" w:color="${theme.metadataBorderColor || 'EC5B13'}"/>
            </w:pBdr>
            <w:tabs>
              <w:tab w:val="right" w:pos="9026"/>
            </w:tabs>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Segoe UI" w:eastAsia="${theme.fontEastAsia}"/>
              <w:sz w:val="18"/>
              <w:color w:val="64748B"/>
            </w:rPr>
            <w:t xml:space="preserve">Generate Time: ${dateStr}</w:t>
          </w:r>
          <w:r><w:tab/></w:r>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Segoe UI" w:eastAsia="${theme.fontEastAsia}"/>
              <w:sz w:val="18"/>
              <w:color w:val="64748B"/>
            </w:rPr>
            <w:t xml:space="preserve">Lumina Edit Pro 商业分析报告</w:t>
          </w:r>
        </w:p>`;
      }

      const headingColor =
        level === 1
          ? theme.primaryHeadingColor
          : level === 2
          ? theme.secondaryHeadingColor
          : theme.id === 'report'
          ? '0F172A'
          : '1E293B';

      const bottomBorder =
        level === 1
          ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${theme.accentColor}"/></w:pBdr>`
          : level === 2 && theme.id === 'whitepaper'
          ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${theme.tableBorderColor}"/></w:pBdr>`
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
        ${renderInlineNodes(el.childNodes, {
          bold: true,
          color: headingColor,
          fontAscii: theme.fontHeading || theme.fontAscii,
          fontEastAsia: theme.fontHeading || theme.fontEastAsia,
        })}
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

      if (/^[^\n：:]{2,14}[：:]$/.test(rawText)) {
        return `<w:p>
          <w:pPr>
            <w:keepNext/>
            <w:spacing w:before="200" w:after="80" w:line="288" w:lineRule="auto"/>
            ${jc}
          </w:pPr>
          ${renderRun(rawText, { bold: true, color: theme.primaryHeadingColor })}
        </w:p>`;
      }

      const indentXml = theme.firstLineIndent ? `<w:ind w:firstLine="${theme.firstLineIndent}"/>` : '';

      const segments = splitNodesByBr(Array.from(el.childNodes));
      if (segments.length <= 1) {
        return `<w:p>
          <w:pPr>
            ${indentXml}
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
            ${indentXml}
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
      let borderColor = theme.calloutDefaultBorder;
      let bgFill = theme.calloutDefaultBg;
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
            <w:left w:val="single" w:sz="16" w:space="8" w:color="${theme.accentColor}"/>
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
            ? `<w:shd w:val="clear" w:color="auto" w:fill="${theme.tableHeaderBg}"/>`
            : rowIdx % 2 === 1
            ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>'
            : '<w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/>';

          const bottomBdr = isHeaderRow
            ? `<w:bottom w:val="single" w:sz="12" w:space="0" w:color="${theme.tableBorderColor}"/>`
            : `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>`;

          cellsXml += `<w:tc>
            <w:tcPr>
              <w:tcBorders>
                <w:top w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>
                ${bottomBdr}
                <w:left w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>
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
              ${renderInlineNodes(cellEl.childNodes, {
                bold: isHeaderRow,
                color: isHeaderRow ? theme.tableHeaderTextColor : theme.bodyColor,
              })}
            </w:p>
          </w:tc>`;
        });

        rowsXml += `<w:tr>${isHeaderRow ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cellsXml}</w:tr>`;
      });

      return `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="5000" w:type="pct"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="8" w:space="0" w:color="${theme.tableBorderColor}"/>
            <w:bottom w:val="single" w:sz="8" w:space="0" w:color="${theme.tableBorderColor}"/>
            <w:left w:val="single" w:sz="6" w:space="0" w:color="${theme.tableBorderColor}"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="${theme.tableBorderColor}"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="${theme.tableInnerBorderColor}"/>
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
          <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${theme.tableBorderColor}"/></w:pBdr>
        </w:pPr>
      </w:p>`;
    }

    return `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr>${renderInlineNodes(el.childNodes)}</w:p>`;
  };

  let bodyXml = '';
  const rootChildren = Array.from(root.children);
  rootChildren.forEach((child, idx) => {
    bodyXml += renderBlockElement(child as HTMLElement, idx === 0);
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
  ${
    opts.includeHeaderFooter
      ? `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
      : ''
  }
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
        <w:color w:val="${theme.accentColor}"/>
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
        <w:color w:val="475569"/>
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
        <w:color w:val="64748B"/>
      </w:rPr>
    </w:lvl>
  </w:abstractNum>
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
        <w:rFonts w:ascii="${theme.fontAscii}" w:hAnsi="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
        <w:b/><w:bCs/>
        <w:color w:val="${theme.accentColor}"/>
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
        <w:rFonts w:ascii="${theme.fontAscii}" w:hAnsi="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}" w:cs="${theme.fontAscii}"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:color w:val="${theme.bodyColor}"/>
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
    <w:rPr><w:b/><w:bCs/><w:sz w:val="38"/><w:szCs w:val="38"/><w:color w:val="${theme.primaryHeadingColor}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="30"/><w:szCs w:val="30"/><w:color w:val="${theme.secondaryHeadingColor}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="25"/><w:szCs w:val="25"/><w:color w:val="${theme.secondaryHeadingColor}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="${theme.bodyColor}"/></w:rPr>
  </w:style>
</w:styles>`;

  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="right"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="4" w:space="4" w:color="E2E8F0"/>
      </w:pBdr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
        <w:sz w:val="17"/><w:szCs w:val="17"/>
        <w:color w:val="64748B"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(docTitle)}</w:t>
    </w:r>
  </w:p>
</w:hdr>`;

  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
        <w:sz w:val="18"/><w:szCs w:val="18"/>
        <w:color w:val="94A3B8"/>
      </w:rPr>
      <w:t xml:space="preserve">第 </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
          <w:sz w:val="18"/><w:szCs w:val="18"/>
          <w:color w:val="64748B"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
        <w:sz w:val="18"/><w:szCs w:val="18"/>
        <w:color w:val="94A3B8"/>
      </w:rPr>
      <w:t xml:space="preserve"> 页 / 共 </w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
          <w:sz w:val="18"/><w:szCs w:val="18"/>
          <w:color w:val="64748B"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.fontAscii}" w:eastAsia="${theme.fontEastAsia}"/>
        <w:sz w:val="18"/><w:szCs w:val="18"/>
        <w:color w:val="94A3B8"/>
      </w:rPr>
      <w:t xml:space="preserve"> 页</w:t>
    </w:r>
  </w:p>
</w:ftr>`;

  const headerRefXml = opts.includeHeaderFooter
    ? `<w:headerReference w:type="default" r:id="rIdHeader"/>`
    : '';
  const footerRefXml = opts.includeHeaderFooter
    ? `<w:footerReference w:type="default" r:id="rIdFooter"/>`
    : '';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      ${headerRefXml}
      ${footerRefXml}
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const encoder = new TextEncoder();
  const zipFiles = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(wordRelsXml) },
    { name: 'word/numbering.xml', data: encoder.encode(numberingXml) },
    { name: 'word/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ];

  if (opts.includeHeaderFooter) {
    zipFiles.push({ name: 'word/header1.xml', data: encoder.encode(headerXml) });
    zipFiles.push({ name: 'word/footer1.xml', data: encoder.encode(footerXml) });
  }

  return buildZipArchive(zipFiles);
}

export async function exportMarkdownToDocx(
  markdown: string,
  fileName?: string,
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void,
  themeId: ExportThemeId = 'report'
): Promise<void> {
  try {
    const baseName = fileName
      ? fileName.replace(/\.docx$/i, '')
      : extractDocumentBaseName(markdown, 'Lumina-Document');
    const targetFileName = `${baseName}.docx`;
    const bytes = generateDocxBytes(markdown, { title: baseName, themeId, includeHeaderFooter: true });

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
