import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, History, RotateCcw, Copy, Trash2, Clock, Check, FileText } from 'lucide-react';
import { HistorySnapshot, getSnapshots, deleteSnapshot, clearSnapshots } from '../lib/timeline';
import { cn } from '../lib/utils';

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  docKey: string;
  currentContent: string;
  onRestoreContent: (restoredContent: string) => void;
  showToast: (msg: string, level?: 'info' | 'warning' | 'error') => void;
}

export default function TimelineModal({
  isOpen,
  onClose,
  docKey,
  currentContent,
  onRestoreContent,
  showToast,
}: TimelineModalProps) {
  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && docKey) {
      const list = getSnapshots(docKey);
      setSnapshots(list);
      if (list.length > 0) {
        setSelectedId(list[0].id);
      } else {
        setSelectedId(null);
      }
    }
  }, [isOpen, docKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedSnapshot = snapshots.find((s) => s.id === selectedId) || snapshots[0] || null;

  const handleRestore = (content: string) => {
    onRestoreContent(content);
    showToast('已成功从历史时光机恢复该版本内容！', 'info');
    onClose();
  };

  const handleCopy = (content: string) => {
    navigator.clipboard?.writeText(content);
    showToast('已复制该版本内容到剪贴板', 'info');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSnapshot(docKey, id);
    const updated = snapshots.filter((s) => s.id !== id);
    setSnapshots(updated);
    if (selectedId === id) {
      setSelectedId(updated[0]?.id || null);
    }
    showToast('已移除该快照记录', 'info');
  };

  const handleClearAll = () => {
    if (window.confirm('确定清空当前文档的所有历史快照吗？')) {
      clearSnapshots(docKey);
      setSnapshots([]);
      setSelectedId(null);
      showToast('已清空所有历史快照', 'info');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative w-full max-w-5xl h-[82vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#18181B] shadow-2xl border border-slate-200 dark:border-[#27272A]"
          >
            {/* Header */}
            <div className="h-13 px-5 flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#1c1c20] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
                  <History size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      本地历史时光机 (Local History)
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-slate-200/70 dark:bg-[#27272A] text-slate-600 dark:text-slate-300">
                      已保存 {snapshots.length} 个历史版本
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    本地静默版本快照 · 防误删 · 支持一键回滚与复制对比
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {snapshots.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs text-rose-500 hover:text-rose-600 px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  >
                    清空历史
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-[#27272A] transition-colors"
                  title="关闭 (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Split View Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Timeline Pane */}
              <div className="w-72 sm:w-80 border-r border-slate-200 dark:border-[#27272A] bg-slate-50/50 dark:bg-[#141416] flex flex-col shrink-0">
                <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-[#27272A]">
                  历史快照时间轴
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {snapshots.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
                      <Clock size={28} className="mx-auto mb-2 opacity-40" />
                      <p>当前文档暂未产生历史快照</p>
                      <p className="text-[10px] mt-1 text-slate-400">每次保存或定期编辑将自动生成版本记录</p>
                    </div>
                  ) : (
                    snapshots.map((snap) => {
                      const isSelected = selectedSnapshot?.id === snap.id;
                      const charDiff = snap.charCount - currentContent.length;

                      return (
                        <div
                          key={snap.id}
                          onClick={() => setSelectedId(snap.id)}
                          className={cn(
                            "relative group p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between",
                            isSelected
                              ? "bg-white dark:bg-[#202024] border-accent shadow-xs"
                              : "border-transparent hover:bg-slate-200/50 dark:hover:bg-[#1e1e22]"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {snap.formattedTime}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.2 rounded font-semibold",
                                  charDiff === 0
                                    ? "bg-slate-100 text-slate-500 dark:bg-[#27272A] dark:text-slate-400"
                                    : charDiff > 0
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                )}
                              >
                                {charDiff > 0 ? `+${charDiff} 字` : charDiff < 0 ? `${charDiff} 字` : '与当前一致'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(snap.id, e)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 transition-opacity"
                                title="删除快照"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {snap.preview || '(无标题快照)'}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Preview & Action Pane */}
              <div className="flex-1 flex flex-col bg-white dark:bg-[#18181B] overflow-hidden">
                {selectedSnapshot ? (
                  <>
                    {/* Action Bar */}
                    <div className="px-5 py-2.5 border-b border-slate-100 dark:border-[#27272A] flex items-center justify-between bg-slate-50/40 dark:bg-[#141416]/40 shrink-0">
                      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          版本快照时间：{selectedSnapshot.formattedTime}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span>{selectedSnapshot.charCount.toLocaleString()} 字符</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedSnapshot.content)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#27272A] transition-colors"
                        >
                          <Copy size={13} />
                          <span>复制内容</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestore(selectedSnapshot.content)}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-strong transition-colors shadow-xs"
                        >
                          <RotateCcw size={13} />
                          <span>恢复至此版本</span>
                        </button>
                      </div>
                    </div>

                    {/* Preview Box */}
                    <div className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap selection:bg-accent-soft selection:text-accent">
                      {selectedSnapshot.content}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                    <FileText size={36} className="mb-2 opacity-30" />
                    <span>请在左侧选择需要对比或恢复的快照</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
