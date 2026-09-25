import { describe, expect, it } from 'vitest';
import { generateDocxBytes } from './exportDocx';
import { extractDocumentBaseName } from './exportSave';

describe('generateDocxBytes (.docx OpenXML exporter)', () => {
  it('extracts the first heading as default export file base name', () => {
    const md = `# 酒店雷达系统对接接口文档\n\n正文内容`;
    expect(extractDocumentBaseName(md)).toBe('酒店雷达系统对接接口文档');
  });
  it('generates a valid PKZIP archive containing OpenXML document and styles', () => {
    const md = `# 项目方案书

> [!NOTE]
> 核心架构说明

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 引擎 | 已完成 | \`OpenXML\` 原生直出 |

\`\`\`typescript
const version = "1.0.0";
\`\`\`
`;

    const bytes = generateDocxBytes(md, 'test.docx');
    // PKZIP magic signature: 0x50 0x4b 0x03 0x04 ("PK\x03\x04")
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('[Content_Types].xml');
    expect(decoded).toContain('word/document.xml');
    expect(decoded).toContain('word/styles.xml');
    expect(decoded).toContain('项目方案书');
    expect(decoded).toContain('Heading1');
    expect(decoded).toContain('<w:tbl>');
  });
});
