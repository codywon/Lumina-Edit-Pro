export type ExportThemeId = 'report' | 'minimal' | 'formal' | 'whitepaper';

export interface ExportThemeConfig {
  id: ExportThemeId;
  label: string;
  tagline: string;
  description: string;
  badge: string;
  accentColor: string; // Hex without #
  primaryHeadingColor: string;
  secondaryHeadingColor: string;
  bodyColor: string;
  fontAscii: string;
  fontEastAsia: string;
  fontHeading?: string;
  firstLineIndent?: number; // dxa, e.g. 420 for 2 chars
  hasBanner: boolean;
  bannerBg?: string;
  bannerTextColor?: string;
  hasMetadataBar: boolean;
  metadataBorderColor?: string;
  tableHeaderBg: string;
  tableHeaderTextColor: string;
  tableBorderColor: string;
  tableInnerBorderColor: string;
  calloutDefaultBorder: string;
  calloutDefaultBg: string;
}

export const EXPORT_THEMES: Record<ExportThemeId, ExportThemeConfig> = {
  report: {
    id: 'report',
    label: '商业报告',
    tagline: '咨询分析与业务汇报首选',
    description: '顶部品牌橙色通栏横幅 · 结构化元数据信息条 · 主题色阶梯标题 (对标智能体分析报告)',
    badge: '推荐 · 商业级',
    accentColor: 'EC5B13',
    primaryHeadingColor: 'EC5B13',
    secondaryHeadingColor: 'C2410C',
    bodyColor: '1E293B',
    fontAscii: 'Microsoft YaHei',
    fontEastAsia: 'Microsoft YaHei',
    fontHeading: 'Microsoft YaHei',
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
  },
  minimal: {
    id: 'minimal',
    label: '经典极简',
    tagline: '开源极简与 Typora 原生质感',
    description: '纯粹白底 · 细线分隔 · 现代中英文混排 · 极致克制纯净',
    badge: '极客首选',
    accentColor: '475569',
    primaryHeadingColor: '0F172A',
    secondaryHeadingColor: '1E293B',
    bodyColor: '334155',
    fontAscii: 'Segoe UI',
    fontEastAsia: 'Microsoft YaHei',
    fontHeading: 'Segoe UI',
    hasBanner: false,
    hasMetadataBar: false,
    tableHeaderBg: 'F8FAFC',
    tableHeaderTextColor: '0F172A',
    tableBorderColor: 'E2E8F0',
    tableInnerBorderColor: 'E2E8F0',
    calloutDefaultBorder: '94A3B8',
    calloutDefaultBg: 'F8FAFC',
  },
  formal: {
    id: 'formal',
    label: '正式公文',
    tagline: '政府与企事业单位公文标准',
    description: '仿宋正文 · 黑体标头 · 首行缩进 2 字符 · 严谨商务双实线网格',
    badge: '机关/国企',
    accentColor: 'C00000',
    primaryHeadingColor: 'C00000',
    secondaryHeadingColor: '000000',
    bodyColor: '000000',
    fontAscii: 'SimSun',
    fontEastAsia: 'FangSong',
    fontHeading: 'SimHei',
    firstLineIndent: 420, // 2-char indent
    hasBanner: false,
    hasMetadataBar: false,
    tableHeaderBg: 'F2F2F2',
    tableHeaderTextColor: '000000',
    tableBorderColor: '000000',
    tableInnerBorderColor: '7F7F7F',
    calloutDefaultBorder: 'C00000',
    calloutDefaultBg: 'FFFBFB',
  },
  whitepaper: {
    id: 'whitepaper',
    label: '白皮书风',
    tagline: '科技巨头与技术架构白皮书',
    description: '商务科技深蓝 · 严谨两端齐平 · 出版级页眉大纲 · 沉稳技术方案质感',
    badge: '技术方案',
    accentColor: '1E40AF',
    primaryHeadingColor: '1E40AF',
    secondaryHeadingColor: '1E3A8A',
    bodyColor: '1E293B',
    fontAscii: 'Segoe UI',
    fontEastAsia: 'Microsoft YaHei',
    fontHeading: 'Segoe UI',
    hasBanner: false,
    hasMetadataBar: true,
    metadataBorderColor: '1E40AF',
    tableHeaderBg: 'EFF6FF',
    tableHeaderTextColor: '1E40AF',
    tableBorderColor: '93C5FD',
    tableInnerBorderColor: 'BFDBFE',
    calloutDefaultBorder: '1E40AF',
    calloutDefaultBg: 'F0F7FF',
  },
};
