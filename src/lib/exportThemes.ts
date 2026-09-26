export type ExportThemeId = 'whitepaper' | 'formal' | 'report' | 'minimal';

export interface ExportThemeMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  header: number;
  footer: number;
}

export interface ExportThemeConfig {
  id: ExportThemeId;
  label: string;
  standardRef: string;
  tagline: string;
  description: string;
  badge: string;
  // Margins in dxa (1 inch = 1440 dxa, 1 mm ≈ 56.7 dxa)
  margins: ExportThemeMargins;
  // Colors (Hex without #)
  accentColor: string;
  primaryHeadingColor: string;
  secondaryHeadingColor: string;
  tertiaryHeadingColor: string;
  bodyColor: string;
  // Typography
  fontAscii: string;
  fontEastAsia: string;
  fontHeadingAscii: string;
  fontHeadingEastAsia: string;
  // Font sizes in half-points (21 = 10.5pt五号, 24 = 12pt小四, 28 = 14pt四号, 32 = 16pt三号)
  bodySize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  h4Size: number;
  // Paragraph line spacing & rules
  lineSpacing: number;
  lineSpacingRule: 'auto' | 'exact' | 'atLeast';
  spaceBeforeParagraph: number;
  spaceAfterParagraph: number;
  firstLineIndent?: number; // dxa
  // Table specifications (Strictly neutral background per publishing standards; no decorative colored headers)
  tableHeaderBg: string;
  tableHeaderTextColor: string;
  tableBorderColor: string;
  tableInnerBorderColor: string;
  tableTopBorderSz?: number;
  tableBottomBorderSz?: number;
  tableIsThreeLine?: boolean;
  // Callouts
  calloutDefaultBorder: string;
  calloutDefaultBg: string;
  // Footer formatting
  footerFormat: 'page_of_pages' | 'gb_formal';
}

export const EXPORT_THEMES: Record<ExportThemeId, ExportThemeConfig> = {
  whitepaper: {
    id: 'whitepaper',
    label: '白皮书风',
    standardRef: 'ISO/IEC & IEEE 科技白皮书出版规范',
    tagline: '科技方案与行业标准白皮书',
    description: '科技深蓝标题 · 严格两端齐平 · 国际标准科技三线表 · 出版级页眉大纲与动态页码',
    badge: '技术方案',
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1587,
      right: 1474,
      header: 720,
      footer: 720,
    },
    // Pantone 294C Classic Corporate Navy
    accentColor: '003366',
    primaryHeadingColor: '003366',
    secondaryHeadingColor: '1E3A8A',
    tertiaryHeadingColor: '0F172A',
    bodyColor: '1E293B',
    fontAscii: 'Segoe UI',
    fontEastAsia: 'Microsoft YaHei',
    fontHeadingAscii: 'Segoe UI',
    fontHeadingEastAsia: 'Microsoft YaHei',
    bodySize: 21, // 10.5pt (五号)
    h1Size: 34,   // 17pt (小二号)
    h2Size: 28,   // 14pt (四号)
    h3Size: 24,   // 12pt (小四号)
    h4Size: 22,   // 11pt
    lineSpacing: 324, // 1.35x
    lineSpacingRule: 'auto',
    spaceBeforeParagraph: 40,
    spaceAfterParagraph: 100,
    // ISO/IEEE Standard Three-line Table: Neutral 2% light gray header, navy boundary lines, NO vertical lines
    tableHeaderBg: 'F8FAFC',
    tableHeaderTextColor: '0F172A',
    tableBorderColor: '003366',
    tableInnerBorderColor: 'E2E8F0',
    tableTopBorderSz: 12,    // 1.5pt top rule
    tableBottomBorderSz: 12, // 1.5pt bottom rule
    tableIsThreeLine: true,
    calloutDefaultBorder: '003366',
    calloutDefaultBg: 'F8FAFC',
    footerFormat: 'page_of_pages',
  },
  formal: {
    id: 'formal',
    label: '正式公文',
    standardRef: 'GB/T 9704-2012 国家公文格式标准',
    tagline: '党政机关与企事业单位公文标准',
    description: '仿宋三号正文 · 黑体/楷体级联标头 · 严格首行缩进 2 字符 · 28 磅公文行距与一字线页码',
    badge: '机关/国企',
    margins: {
      top: 2098,
      bottom: 1984,
      left: 1587,
      right: 1474,
      header: 720,
      footer: 720,
    },
    accentColor: '000000',
    primaryHeadingColor: '000000',
    secondaryHeadingColor: '000000',
    tertiaryHeadingColor: '000000',
    bodyColor: '000000',
    fontAscii: 'Times New Roman',
    fontEastAsia: 'FangSong',
    fontHeadingAscii: 'Times New Roman',
    fontHeadingEastAsia: 'SimHei',
    bodySize: 32, // 16pt (三号仿宋，国标第 7.3.3 条强制规定)
    h1Size: 32,   // 16pt (三号黑体)
    h2Size: 32,   // 16pt (三号楷体)
    h3Size: 32,   // 16pt (三号仿宋加粗)
    h4Size: 32,   // 16pt (三号仿宋)
    firstLineIndent: 640, // 2 字符严格首行缩进
    lineSpacing: 560,     // 28 磅固定行距
    lineSpacingRule: 'exact',
    spaceBeforeParagraph: 0,
    spaceAfterParagraph: 0,
    // GB/T 9704 Official Table: Strictly Monochrome, white header, full black grid lines, NO colors
    tableHeaderBg: 'FFFFFF',
    tableHeaderTextColor: '000000',
    tableBorderColor: '000000',
    tableInnerBorderColor: '000000',
    calloutDefaultBorder: '000000',
    calloutDefaultBg: 'FFFFFF',
    footerFormat: 'gb_formal',
  },
  report: {
    id: 'report',
    label: '商业报告',
    standardRef: '国际商业与战略咨询报告标准 (McKinsey/Gartner)',
    tagline: '咨询分析与业务汇报首选',
    description: 'Executive 暖橙主标头 · 深灰层级标题 · 中性浅灰数据网格表 · 出版级严谨字距',
    badge: '商业级',
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1440,
      right: 1440,
      header: 720,
      footer: 720,
    },
    accentColor: 'EC5B13',
    primaryHeadingColor: 'EC5B13',
    secondaryHeadingColor: '0F172A',
    tertiaryHeadingColor: '1E293B',
    bodyColor: '1E293B',
    fontAscii: 'Segoe UI',
    fontEastAsia: 'Microsoft YaHei',
    fontHeadingAscii: 'Segoe UI',
    fontHeadingEastAsia: 'Microsoft YaHei',
    bodySize: 21, // 10.5pt (五号)
    h1Size: 36,   // 18pt
    h2Size: 28,   // 14pt
    h3Size: 24,   // 12pt
    h4Size: 22,   // 11pt
    lineSpacing: 324, // 1.35x
    lineSpacingRule: 'auto',
    spaceBeforeParagraph: 40,
    spaceAfterParagraph: 120,
    // Business Report Table: Neutral light gray header (#F1F5F9), dark slate text, crisp light border
    tableHeaderBg: 'F1F5F9',
    tableHeaderTextColor: '0F172A',
    tableBorderColor: 'CBD5E1',
    tableInnerBorderColor: 'E2E8F0',
    calloutDefaultBorder: 'EC5B13',
    calloutDefaultBg: 'F8FAFC',
    footerFormat: 'page_of_pages',
  },
  minimal: {
    id: 'minimal',
    label: '经典极简',
    standardRef: 'GitHub GFM / Typora 国际排版标准',
    tagline: '开源极简与 Typora 原生质感',
    description: '纯粹白底 · 细线微距 · GitHub 官方灰阶配色 · 极致克制纯净',
    badge: '极客首选',
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1440,
      right: 1440,
      header: 720,
      footer: 720,
    },
    accentColor: '0969DA',
    primaryHeadingColor: '0F172A',
    secondaryHeadingColor: '1E293B',
    tertiaryHeadingColor: '24292F',
    bodyColor: '24292F',
    fontAscii: 'Segoe UI',
    fontEastAsia: 'Microsoft YaHei',
    fontHeadingAscii: 'Segoe UI',
    fontHeadingEastAsia: 'Microsoft YaHei',
    bodySize: 21, // 10.5pt (五号)
    h1Size: 40,   // 20pt
    h2Size: 30,   // 15pt
    h3Size: 25,   // 12.5pt
    h4Size: 22,   // 11pt
    lineSpacing: 336, // 1.4x
    lineSpacingRule: 'auto',
    spaceBeforeParagraph: 40,
    spaceAfterParagraph: 140,
    // GitHub GFM Table: #F6F8FA neutral header, #D0D7DE gray borders
    tableHeaderBg: 'F6F8FA',
    tableHeaderTextColor: '1F2328',
    tableBorderColor: 'D0D7DE',
    tableInnerBorderColor: 'E2E8F0',
    calloutDefaultBorder: '0969DA',
    calloutDefaultBg: 'F6F8FA',
    footerFormat: 'page_of_pages',
  },
};
