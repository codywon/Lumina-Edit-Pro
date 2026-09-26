import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart3, Feather, Landmark, BookOpen, FileDown, CheckCircle2 } from 'lucide-react';
import { ExportThemeId, EXPORT_THEMES } from '../lib/exportThemes';
import { exportMarkdownToDocx } from '../lib/exportDocx';
import { extractDocumentBaseName } from '../lib/exportSave';
import { cn } from '../lib/utils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  showToast: (msg: string, level?: 'info' | 'warning' | 'error') => void;
}

export default function ExportModal({ isOpen, onClose, content, showToast }: ExportModalProps) {
  const [selectedTheme, setSelectedTheme] = useState<ExportThemeId>('report');
  const [docTitle, setDocTitle] = useState('');
  const [includeHeaderFooter, setIncludeHeaderFooter] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDocTitle(extractDocumentBaseName(content, 'Lumina-Document'));
    }
  }, [isOpen, content]);

  const handleConfirmExport = async () => {
    try {
      setIsExporting(true);
      await exportMarkdownToDocx(
        content,
        docTitle.trim() || 'Lumina-Document',
        showToast,
        selectedTheme
      );
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const themeIcons: Record<ExportThemeId, React.ReactNode> = {
    whitepaper: <BookOpen size={20} className="text-[#003366]" />,
    formal: <Landmark size={20} className="text-slate-800 dark:text-slate-200" />,
    report: <BarChart3 size={20} className="text-[#EC5B13]" />,
    minimal: <Feather size={20} className="text-[#475569] dark:text-[#94A3B8]" />,
  };

  const themePreviewColors: Record<ExportThemeId, { border: string; bg: string; activeRing: string }> = {
    whitepaper: {
      border: 'border-[#003366]/40',
      bg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
      activeRing: 'ring-2 ring-[#003366] bg-[#F0F4F8]/70 dark:bg-[#003366]/15 border-[#003366]',
    },
    formal: {
      border: 'border-slate-400 dark:border-slate-600',
      bg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
      activeRing: 'ring-2 ring-slate-900 bg-slate-100/80 dark:bg-slate-800/60 border-slate-900',
    },
    report: {
      border: 'border-[#EC5B13]/40',
      bg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
      activeRing: 'ring-2 ring-[#EC5B13] bg-[#FFF7ED]/70 dark:bg-[#EC5B13]/15 border-[#EC5B13]',
    },
    minimal: {
      border: 'border-slate-300 dark:border-slate-700',
      bg: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
      activeRing: 'ring-2 ring-slate-600 bg-slate-100/70 dark:bg-slate-800/60 border-slate-600',
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white dark:bg-[#18181B] shadow-2xl border border-slate-200 dark:border-[#27272A] p-6 text-left"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#27272A]">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
                  <FileDown size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    导出为Word
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    严格对齐国家公文与科技行业出版规范 · 原生 OpenXML 引擎
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-[#27272A] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="py-4 space-y-4">
              {/* Document Title Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  文档标题 / 文件名
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="请输入文档标题"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#121214] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
              </div>

              {/* Theme Grid */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  选择排版主题风格 (4大行业权威标准规范)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(EXPORT_THEMES) as ExportThemeId[]).map((tId) => {
                    const cfg = EXPORT_THEMES[tId];
                    const isSelected = selectedTheme === tId;
                    const style = themePreviewColors[tId];

                    return (
                      <button
                        key={tId}
                        type="button"
                        onClick={() => setSelectedTheme(tId)}
                        className={cn(
                          "relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between",
                          style.border,
                          style.bg,
                          isSelected ? style.activeRing : "bg-white dark:bg-[#121214]"
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {themeIcons[tId]}
                              <span className="text-sm font-bold text-slate-900 dark:text-white">
                                {cfg.label}
                              </span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-300">
                              {cfg.badge}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-1">
                            {cfg.tagline}
                          </p>
                          <p className="text-[11px] font-semibold text-accent mt-0.5">
                            {cfg.standardRef}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            {cfg.description}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5">
                            <CheckCircle2 size={16} className="text-accent" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Options */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHeaderFooter}
                    onChange={(e) => setIncludeHeaderFooter(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-accent focus:ring-accent accent-accent"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    生成标准页眉（居右文档名）与页脚动态页码（第 X 页 / 共 Y 页）
                  </span>
                </label>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#27272A]">
              <button
                type="button"
                onClick={onClose}
                disabled={isExporting}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-strong transition-colors shadow-sm disabled:opacity-50"
              >
                <FileDown size={15} />
                <span>{isExporting ? '正在生成...' : '立即导出为Word'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
