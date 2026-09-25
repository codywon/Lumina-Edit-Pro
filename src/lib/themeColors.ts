export type ThemeColor = 'orange' | 'blue' | 'green' | 'teal' | 'purple' | 'graphite' | 'sakura' | 'custom';

export const THEME_COLORS: Record<ThemeColor, { id: ThemeColor; label: string; hex: string; rgb: string; strong: string }> = {
  orange: { id: 'orange', label: '\u6696\u6a59', hex: '#ec5b13', rgb: '236, 91, 19', strong: '#d94b0f' },
  blue: { id: 'blue', label: '\u79d1\u6280\u84dd', hex: '#3b82f6', rgb: '59, 130, 246', strong: '#2563eb' },
  green: { id: 'green', label: '\u7fe0\u7eff', hex: '#10b981', rgb: '16, 185, 129', strong: '#059669' },
  teal: { id: 'teal', label: '\u9752\u84dd', hex: '#14b8a6', rgb: '20, 184, 166', strong: '#0d9488' },
  purple: { id: 'purple', label: '\u7d2b\u7f57\u5170', hex: '#8b5cf6', rgb: '139, 92, 246', strong: '#7c3aed' },
  graphite: { id: 'graphite', label: '\u77f3\u58a8\u9ed1', hex: '#475569', rgb: '71, 85, 105', strong: '#334155' },
  sakura: { id: 'sakura', label: '\u6a31\u82b1\u7c89', hex: '#f472b6', rgb: '244, 114, 182', strong: '#ec4899' },
  custom: { id: 'custom', label: '\u81ea\u5b9a\u4e49', hex: '#ec5b13', rgb: '236, 91, 19', strong: '#d94b0f' },
};
