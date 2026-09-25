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

    // Local file header (30 bytes + nameBytes)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true); // Compression: 0 (Store)
    lv.setUint16(10, 0, true); // Mod time
    lv.setUint16(12, 0x21, true); // Mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader, file.data);

    // Central directory file header (46 bytes + nameBytes)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Compression: Store
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x21, true); // Mod date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralHeaders.reduce((acc, arr) => acc + arr.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central dir signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central dir
  ev.setUint16(8, files.length, true); // Entries on this disk
  ev.setUint16(10, files.length, true); // Total entries
  ev.setUint32(12, centralSize, true); // Size of central dir
  ev.setUint32(16, offset, true); // Offset of central dir
  ev.setUint16(20, 0, true); // Comment length

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
 * Convert Markdown string into a native OpenXML (.docx) binary Uint8Array
 */
export function generateDocxBytes(markdown: string, title = 'Lumina Document'): Uint8Array {
  const html = marked.parse(markdown, { async: false }) as string;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  const relationships: { id: string; type: string; target: string; external?: boolean }[] = [
    {
      id: 'rId1',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
      target: 'styles.xml',
    },
  ];
  let nextRelId = 2;

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
      rPr.push('<w:sz w:val="19"/><w:szCs w:val="19"/>');
      rPr.push('<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>');
      rPr.push('<w:color w:val="D94B0F"/>');
    } else {
      rPr.push('<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/>');
      if (fmt.color) {
        rPr.push(`<w:color w:val="${fmt.color}"/>`);
      }
    }
    if (fmt.bold) rPr.push('<w:b/>');
    if (fmt.italic) rPr.push('<w:i/>');
    if (fmt.strike) rPr.push('<w:strike/>');
    if (fmt.highlight) rPr.push('<w:highlight w:val="yellow"/>');
    if (fmt.linkRId) {
      rPr.push('<w:color w:val="EC5B13"/><w:u w:val="single"/>');
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
          const alt = el.getAttribute('alt') || '图片';
          out += renderRun(`[🖼️ ${alt}]`, { ...fmt, color: '64748B', italic: true });
        } else {
          out += renderInlineNodes(el.childNodes, fmt);
        }
      }
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
        level <= 2
          ? `<w:pBdr><w:bottom w:val="single" w:sz="${level === 1 ? 8 : 4}" w:space="4" w:color="E2E8F0"/></w:pBdr>`
          : '';
      return `<w:p>
        <w:pPr>
          <w:pStyle w:val="Heading${level}"/>
          <w:outlineLvl w:val="${level - 1}"/>
          <w:spacing w:before="${level === 1 ? 320 : 240}" w:after="120"/>
          ${jc}
          ${bottomBorder}
        </w:pPr>
        ${renderInlineNodes(el.childNodes, { bold: true })}
      </w:p>`;
    }

    // Paragraph or Div
    if (tag === 'p' || tag === 'div') {
      const align = el.getAttribute('align') || el.style.textAlign || '';
      const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : '';
      return `<w:p>
        <w:pPr>
          <w:spacing w:before="80" w:after="140" w:line="340" w:lineRule="auto"/>
          ${jc}
        </w:pPr>
        ${renderInlineNodes(el.childNodes)}
      </w:p>`;
    }

    // Blockquote & Callouts
    if (tag === 'blockquote') {
      const rawText = (el.textContent || '').trim();
      const calloutMatch = rawText.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i);
      let borderColor = 'EC5B13';
      let bgFill = 'FFF7ED';
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
          <w:spacing w:before="140" w:after="140" w:line="320" w:lineRule="auto"/>
          <w:ind w:left="360" w:right="240"/>
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
            `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="19"/><w:color w:val="1E293B"/></w:rPr>${
              idx > 0 ? '<w:br/>' : ''
            }<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
        )
        .join('');

      return `<w:p>
        <w:pPr>
          <w:spacing w:before="140" w:after="140" w:line="280" w:lineRule="auto"/>
          <w:ind w:left="200" w:right="200"/>
          <w:pBdr>
            <w:top w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:bottom w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/>
            <w:left w:val="single" w:sz="4" w:space="8" w:color="CBD5E1"/>
            <w:right w:val="single" w:sz="4" w:space="8" w:color="CBD5E1"/>
          </w:pBdr>
          <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
        </w:pPr>
        ${runs}
      </w:p>`;
    }

    // Unordered & Ordered Lists
    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol';
      let out = '';
      const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
      items.forEach((li, idx) => {
        const hasCheckbox = li.querySelector('input[type="checkbox"]') !== null;
        const prefix = hasCheckbox ? '' : isOrdered ? `${idx + 1}. ` : '• ';
        out += `<w:p>
          <w:pPr>
            <w:spacing w:before="40" w:after="60" w:line="320" w:lineRule="auto"/>
            <w:ind w:left="480" w:hanging="240"/>
          </w:pPr>
          ${prefix ? renderRun(prefix, { bold: isOrdered, color: 'EC5B13' }) : ''}
          ${renderInlineNodes(li.childNodes)}
        </w:p>`;
      });
      return out;
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
            ? '<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>'
            : rowIdx % 2 === 1
            ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>'
            : '<w:shd w:val="clear" w:color="auto" w:fill="FAFBFC"/>';

          const bottomBdr = isHeaderRow
            ? '<w:bottom w:val="single" w:sz="12" w:space="0" w:color="D0D7DE"/>'
            : '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>';

          cellsXml += `<w:tc>
            <w:tcPr>
              <w:tcBorders>
                <w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>
                ${bottomBdr}
                <w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7DE"/>
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
              ${renderInlineNodes(cellEl.childNodes, { bold: isHeaderRow })}
            </w:p>
          </w:tc>`;
        });

        rowsXml += `<w:tr>${isHeaderRow ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cellsXml}</w:tr>`;
      });

      return `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="5000" w:type="pct"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="D0D7DE"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D0D7DE"/>
            <w:left w:val="single" w:sz="6" w:space="0" w:color="D0D7DE"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="D0D7DE"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
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

    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${renderInlineNodes(el.childNodes)}</w:p>`;
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

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei" w:cs="Segoe UI"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="1F2328"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1E293B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="3"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="334155"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="4"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="475569"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:outlineLvl w:val="5"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr>
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
