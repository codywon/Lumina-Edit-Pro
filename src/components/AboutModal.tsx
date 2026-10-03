import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Globe, Sparkles, BookOpen } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenManual?: () => void;
  onCheckUpdate?: () => void;
}

export default function AboutModal({ isOpen, onClose, onOpenManual, onCheckUpdate }: AboutModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-[#18181B] shadow-2xl border border-slate-200 dark:border-[#27272A]"
          >
            {/* Header Image/Gradient */}
            <div className="h-32 bg-accent-gradient flex items-center justify-center relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-black/10 hover:bg-black/20 text-white transition-colors"
              >
                <X size={18} />
              </button>
              <div className="size-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                <Sparkles size={32} className="text-white" />
              </div>
            </div>

            <div className="p-8 pt-6 text-center">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Lumina Edit Pro</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">面向 AI 的下一代 Markdown 编辑器</p>
              
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#27272A] border border-slate-100 dark:border-white/5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">当前版本</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent">v1.1.4 (Release)</span>
                    {onCheckUpdate && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onCheckUpdate();
                        }}
                        className="text-[11px] px-2 py-0.5 rounded bg-accent/10 hover:bg-accent/20 text-accent font-semibold transition-colors"
                      >
                        检查更新
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors group">
                    <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Globe size={16} />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">作者</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">codywon</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors group">
                    <div className="size-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                      <Mail size={16} />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">联系邮箱</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">290923628@qq.com</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenManual?.();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-strong transition-colors shadow-sm"
                >
                  <BookOpen size={14} />
                  操作手册
                </button>
                <button 
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#27272A] transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-[#121214] border-t border-slate-100 dark:border-[#27272A] text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Powered by codywon · 仅供学习和交流</p>
              <p className="text-[10px] text-slate-400">个人使用免费许可 · 严禁任何商业用途 · © 2026 Lumina Edit Pro</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
