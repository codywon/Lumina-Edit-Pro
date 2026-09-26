import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, ExternalLink } from 'lucide-react';
import manualHtml from '../../docs/用户手册.html?raw';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserManualModal({ isOpen, onClose }: UserManualModalProps) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleOpenExternal = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('app_open_user_manual');
    } catch {
      const blob = new Blob([manualHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
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
            className="relative w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#121214] shadow-2xl border border-slate-200 dark:border-[#27272A]"
          >
            {/* Top Bar */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] bg-slate-50/90 dark:bg-[#18181B] shrink-0 select-none">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                <BookOpen size={16} className="text-accent" />
                <span>Lumina Edit Pro 官方操作手册 (内嵌离线版 v1.0.0)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#27272A] text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors"
                  title="在系统默认浏览器中全屏打开"
                >
                  <ExternalLink size={12} />
                  <span>在浏览器中打开</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:text-white dark:hover:bg-[#27272A] transition-colors"
                  title="关闭 (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Embedded Interactive HTML Manual */}
            <iframe
              title="Lumina Edit Pro 官方操作手册"
              srcDoc={manualHtml}
              className="w-full flex-1 border-0 bg-white dark:bg-[#0f172a]"
              sandbox="allow-scripts allow-same-origin"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
