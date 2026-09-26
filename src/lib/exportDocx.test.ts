import { describe, expect, it } from 'vitest';
import { generateDocxBytes } from './exportDocx';
import { extractDocumentBaseName } from './exportSave';

describe('generateDocxBytes (.docx OpenXML 2.0 multi-theme exporter)', () => {
  it('extracts the first heading as default export file base name', () => {
    const md = `# 酒店雷达系统对接接口文档\n\n正文内容`;
    expect(extractDocumentBaseName(md)).toBe('酒店雷达系统对接接口文档');
  });

  it('generates a valid PKZIP archive containing OpenXML document, numbering, styles, header and footer', () => {
    const md = `# 养老机构智能体分析报告

> [!NOTE]
> 核心架构说明

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 引擎 | 已完成 | \`OpenXML\` 原生直出 |

\`\`\`typescript
const version = "1.0.0";
\`\`\`
`;

    const bytes = generateDocxBytes(md, { themeId: 'report', title: '分析报告', includeHeaderFooter: true });
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('[Content_Types].xml');
    expect(decoded).toContain('word/document.xml');
    expect(decoded).toContain('word/styles.xml');
    expect(decoded).toContain('word/numbering.xml');
    expect(decoded).toContain('word/header1.xml');
    expect(decoded).toContain('word/footer1.xml');
    expect(decoded).toContain('PAGE');
    expect(decoded).toContain('NUMPAGES');
    // Content is faithfully preserved without arbitrary injected text
    expect(decoded).toContain('养老机构智能体分析报告');
    expect(decoded).not.toContain('Generate Time:');
    expect(decoded).not.toContain('Lumina Edit Pro 商业分析报告');
  });

  it('preserves numeric ranges without false strikethroughs and indents list continuation paragraphs', () => {
    const specMd = `规则：
• config_revision 必须为整数且严格递增（≥1，≤4294967295）；设备拒绝不大于当前版本的配置。
• 除全部字段必填；sleep_observe_minutes 1~1440，deep_sleep_minutes 2~2880。
• 阈值约束：motion_moving_mps 0.10~2.00，motion_fast_mps 0.10~3.00。
• 上报模式（可选，schema v5 追加字段，旧固件忽略）：
telemetry_profile：0=全量上报（默认），1=精简上报。
精简上报只改发布时机，下行/上行报文格式都不变：触发条件为人数变化
省略即保留：不带该字段时设备保留当前模式。
该策略只影响发布时机，不影响检测与判定。


• 校验失败：设备在 status 主题回 rejected + reason。
处理流程：received → 持久化 persisted → 应用 applied。`;

    const bytes = generateDocxBytes(specMd, { themeId: 'report', title: '测试文档' });
    const decoded = new TextDecoder().decode(bytes);

    // 1. Tildes in numeric ranges (1~1440, 2~2880, 0.10~2.00) must NEVER be strikethrough
    expect(decoded).not.toContain('<w:strike/>');
    expect(decoded).toContain('1~1440');
    expect(decoded).toContain('2~2880');
    expect(decoded).toContain('0.10~2.00');

    // 2. Native numbering applied to bullets
    expect(decoded).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');

    // 3. Continuation lines within list items have text-aligned indent (480 dxa)
    expect(decoded).toContain('<w:ind w:left="480"/>');
    expect(decoded).toContain('telemetry_profile：0=全量上报');
    expect(decoded).toContain('处理流程：received');
  });

  it('supports all 4 commercial themes (report, minimal, formal, whitepaper)', () => {
    const md = `# 规范文档\n\n正文内容说明`;

    const reportBytes = generateDocxBytes(md, { themeId: 'report' });
    const reportDecoded = new TextDecoder().decode(reportBytes);
    expect(reportDecoded).toContain('EC5B13');

    const minimalBytes = generateDocxBytes(md, { themeId: 'minimal' });
    const minimalDecoded = new TextDecoder().decode(minimalBytes);
    expect(minimalDecoded).toContain('0969DA');

    const formalBytes = generateDocxBytes(md, { themeId: 'formal' });
    const formalDecoded = new TextDecoder().decode(formalBytes);
    expect(formalDecoded).toContain('FangSong');
    expect(formalDecoded).toContain('w:firstLine="640"');

    const whitepaperBytes = generateDocxBytes(md, { themeId: 'whitepaper' });
    const whitepaperDecoded = new TextDecoder().decode(whitepaperBytes);
    expect(whitepaperDecoded).toContain('003366');
  });

  it('renders a professional Table of Contents when [TOC] marker is present', () => {
    const md = `# 第一章 系统概述\n\n正文 1\n\n[TOC]\n\n## 1.1 架构设计\n\n正文 2\n\n### 1.1.1 核心服务\n\n正文 3`;
    const bytes = generateDocxBytes(md, 'toc.docx');
    const decoded = new TextDecoder().decode(bytes);

    expect(decoded).toContain('目  录');
    expect(decoded).toContain('第一章 系统概述');
    expect(decoded).toContain('1.1 架构设计');
    expect(decoded).toContain('1.1.1 核心服务');
  });

  it('extracts YAML frontmatter and renders a clean executive metadata table in Word export', () => {
    const md = `---
title: 酒店雷达系统对接接口文档
author: codywon
version: v1.0.0
status: 评审中
tags: [酒店, 毫米波雷达]
---

# 正文标题

这里是正文说明。`;

    const bytes = generateDocxBytes(md, 'doc.docx');
    const decoded = new TextDecoder().decode(bytes);

    expect(decoded).toContain('酒店雷达系统对接接口文档');
    expect(decoded).toContain('codywon');
    expect(decoded).toContain('v1.0.0');
    expect(decoded).toContain('评审中');
    expect(decoded).toContain('酒店, 毫米波雷达');
  });

  it('preserves code blocks and inline codes with tildes without corrupting them into html entities', () => {
    const md = `# 代码测试

\`\`\`bash
cd ~
tar -czf ~/backup.tar.gz .
\`\`\`

使用 \`~/config.json\` 配置。
`;

    const bytes = generateDocxBytes(md, 'code.docx');
    const decoded = new TextDecoder().decode(bytes);

    // Code block and inline code must contain literal ~ and NOT &#126;
    expect(decoded).toContain('cd ~');
    expect(decoded).toContain('~/backup.tar.gz');
    expect(decoded).toContain('~/config.json');
    expect(decoded).not.toContain('&#126;');
  });
});
