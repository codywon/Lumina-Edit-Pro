export type ExportThemeId = 'report' | 'minimal' | 'formal' | 'whitepaper';

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
  // Layout features
  hasBanner: boolean;
  bannerBg?: string;
  bannerTextColor?: string;
  hasMetadataBar: boolean;
  metadataBorderColor?: string;
  // Table specifications
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
  // Header and Footer formatting
  headerLeftText?: string;
  footerFormat: 'page_of_pages' | 'gb_formal';
}

export const EXPORT_THEMES: Record<ExportThemeId, ExportThemeConfig> = {
  whitepaper: {
    id: 'whitepaper',
    label: '白皮书风',
    standardRef: 'ISO/IEEE / 科技巨头白皮书规范',
    tagline: '科技方案与行业标准白皮书',
    description: 'Pantone 294C 科技深蓝 · 严谨两端齐平 · 科技三线表 · 专业出版级页眉大纲与动态页码',
    badge: '技术方案',
    // ISO/IEEE Standard A4 Margins: Top 25.4mm, Bottom 25.4mm, Binding Left 28mm, Cut Right 26mm
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1587,
      right: 1474,
      header: 720,
      footer: 720,
    },
    // Classic Corporate Navy (Pantone 294C / #003366)
    accentColor: '003366',
    primaryHeadingColor: '003366',
    secondaryHeadingColor: '1E3A8A',
    tertiaryHeadingColor: '0F172A',
    bodyColor: '1E293B',
    // Neo-grotesque technical typography
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
    hasBanner: false,
    hasMetadataBar: true,
    metadataBorderColor: '003366',
    // ISO/IEEE Standard Three-line Table (三线表)
    tableHeaderBg: 'F0F4F8',
    tableHeaderTextColor: '003366',
    tableBorderColor: '003366',
    tableInnerBorderColor: 'CBD5E1',
    tableTopBorderSz: 12,    // 1.5pt thick boundary
    tableBottomBorderSz: 12, // 1.5pt thick boundary
    tableIsThreeLine: true,
    calloutDefaultBorder: '003366',
    calloutDefaultBg: 'F8FAFC',
    headerLeftText: 'WHITE PAPER SERIES',
    footerFormat: 'page_of_pages',
  },
  formal: {
    id: 'formal',
    label: '正式公文',
    standardRef: 'GB/T 9704-2012 国家公文格式标准',
    tagline: '党政机关与企事业单位公文标准',
    description: '仿宋三号正文 · 黑体/楷体级联标头 · 严格首行缩进 2 字符 · 28 磅公文行距与一字线页码',
    badge: '机关/国企',
    // GB/T 9704-2012 Section 5.2.1 Page Margins: Top 37mm (2098 dxa), Bottom 35mm (1984 dxa), Left 28mm (1587 dxa), Right 26mm (1474 dxa)
    margins: {
      top: 2098,
      bottom: 1984,
      left: 1587,
      right: 1474,
      header: 720,
      footer: 720,
    },
    accentColor: 'CE0000', // 国旗红 / 标头红 (Pantone 186C)
    primaryHeadingColor: '000000',   // 一级标题：三号黑体
    secondaryHeadingColor: '000000', // 二级标题：三号楷体
    tertiaryHeadingColor: '000000',  // 三级标题：三号仿宋加粗
    bodyColor: '000000',             // 纯黑
    fontAscii: 'Times New Roman',
    fontEastAsia: 'FangSong',        // 仿宋
    fontHeadingAscii: 'Times New Roman',
    fontHeadingEastAsia: 'SimHei',   // 黑体
    bodySize: 32, // 16pt (三号，国标 GB/T 9704 第 7.3.3 条：“公文首页必须使用三号仿宋体字”)
    h1Size: 32,   // 16pt (三号黑体)
    h2Size: 32,   // 16pt (三号楷体)
    h3Size: 32,   // 16pt (三号仿宋加粗)
    h4Size: 32,   // 16pt (三号仿宋)
    firstLineIndent: 640, // 2 字符首行缩进 (16pt * 2 * 20 = 640 dxa)
    lineSpacing: 560,     // 28 磅固定行间距 (符合国标“一般每面排 28 行”)
    lineSpacingRule: 'exact',
    spaceBeforeParagraph: 0,
    spaceAfterParagraph: 0,
    hasBanner: false,
    hasMetadataBar: false,
    // 公文标准黑白网格表 (不使用彩色底纹)
    tableHeaderBg: 'FFFFFF',
    tableHeaderTextColor: '000000',
    tableBorderColor: '000000',
    tableInnerBorderColor: '000000',
    calloutDefaultBorder: 'CE0000',
    calloutDefaultBg: 'FFFBFB',
    footerFormat: 'gb_formal', // GB/T 9704 第 7.5 条：“页码一般用4号半角宋体阿拉伯数字，左右各放一条一字线『— 1 —』”
  },
  report: {
    id: 'report',
    label: '商业报告',
    standardRef: '国际商业与战略咨询报告标准',
    tagline: '咨询分析与业务汇报首选',
    description: '顶部品牌橙色通栏横幅 · 结构化元数据信息条 · 暖色调阶梯标题 (对标智能体分析报告)',
    badge: '商业级',
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1440,
      right: 1440,
      header: 720,
      footer: 720,
    },
    // Executive Warm Orange (Pantone 1655C / #EC5B13)
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
    hasBanner: true,
    bannerBg: 'EC5B13',
    bannerTextColor: 'FFFFFF',
    hasMetadataBar: true,
    metadataBorderColor: 'EC5B13',
    tableHeaderBg: 'FFF7ED',
    tableHeaderTextColor: '9A3412',
    tableBorderColor: 'FDBA74',
    tableInnerBorderColor: 'FED7AA',
    calloutDefaultBorder: 'EC5B13',
    calloutDefaultBg: 'FFF7ED',
    headerLeftText: 'BUSINESS REPORT',
    footerFormat: 'page_of_pages',
  },
  minimal: {
    id: 'minimal',
    label: '经典极简',
    standardRef: 'GitHub / Typora 原生排版标准',
    tagline: '开源极简与 Typora 原生质感',
    description: '纯粹白底 · 细线微距 · GitHub 官方 Markdown 灰阶配色 · 极致克制纯净',
    badge: '极客首选',
    margins: {
      top: 1440,
      bottom: 1440,
      left: 1440,
      right: 1440,
      header: 720,
      footer: 720,
    },
    accentColor: '0969DA', // GitHub Blue
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
    hasBanner: false,
    hasMetadataBar: false,
    tableHeaderBg: 'F6F8FA',
    tableHeaderTextColor: '0F172A',
    tableBorderColor: 'D0D7DE',
    tableInnerBorderColor: 'E2E8F0',
    calloutDefaultBorder: '0969DA',
    calloutDefaultBg: 'F6F8FA',
    footerFormat: 'page_of_pages',
  },
};
