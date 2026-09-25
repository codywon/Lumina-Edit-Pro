import { describe, expect, it } from 'vitest';
import { generateDocxBytes } from './exportDocx';
import { extractDocumentBaseName } from './exportSave';

describe('generateDocxBytes (.docx OpenXML 2.0 commercial exporter)', () => {
  it('extracts the first heading as default export file base name', () => {
    const md = `# 酒店雷达系统对接接口文档\n\n正文内容`;
    expect(extractDocumentBaseName(md)).toBe('酒店雷达系统对接接口文档');
  });

  it('generates a valid PKZIP archive containing OpenXML document, numbering, and styles', () => {
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
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('[Content_Types].xml');
    expect(decoded).toContain('word/document.xml');
    expect(decoded).toContain('word/styles.xml');
    expect(decoded).toContain('word/numbering.xml');
    expect(decoded).toContain('项目方案书');
    expect(decoded).toContain('Heading1');
    expect(decoded).toContain('<w:tbl>');
  });

  it('formats complex technical specification lists with multi-paragraph continuations, lead-in bolding, and Consolas tokens', () => {
    const specMd = `规则：
• config_revision 必须为整数且严格递增（≥1，≤4294967295）；设备拒绝不大于当前版本的配置。
• 阈值约束：deep_dop ≤ light_dop ≤ awake_dop，deep_jitter ≤ light_jitter。
• 上报模式（可选，schema v5 追加字段，旧固件忽略）：
telemetry_profile：0=全量上报（默认），1=精简上报。
省略即保留：不带该字段时设备保留当前模式。


• 校验失败：设备在 status 主题回 rejected + reason。
处理流程：received → 持久化 persisted → 应用 applied。`;

    const bytes = generateDocxBytes(specMd, 'spec.docx');
    const decoded = new TextDecoder().decode(bytes);

    // 1. Native numbering applied to bullets
    expect(decoded).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    // 2. Indented continuation paragraphs for sub-paragraphs inside list items
    expect(decoded).toContain('<w:ind w:left="420"/>');
    // 3. Lead-in terms bolded in deep slate (#0F172A)
    expect(decoded).toContain('阈值约束：');
    expect(decoded).toContain('处理流程：');
    // 4. Technical identifiers rendered in Consolas monospace
    expect(decoded).toContain('config_revision');
    expect(decoded).toContain('w:ascii="Consolas"');
    // 5. CJK justification & auto-spacing enabled
    expect(decoded).toContain('<w:jc w:val="both"/>');
    expect(decoded).toContain('<w:autoSpaceDE w:val="1"/>');
  });
});
