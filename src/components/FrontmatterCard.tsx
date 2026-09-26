import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, FileCode, Tag, User, Calendar, ShieldCheck, Bookmark } from 'lucide-react';
import { FrontmatterData } from '../lib/frontmatter';
import { cn } from '../lib/utils';

interface FrontmatterCardProps {
  data: FrontmatterData;
  onEditInSource?: () => void;
}

export default function FrontmatterCard({ data, onEditInSource }: FrontmatterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Key fields for top badges
  const { title, author, version, date, status, category, tags, ...customFields } = data;

  return (
    <div className="print-hide my-3 select-none rounded-xl border border-slate-200/90 dark:border-[#27272A] bg-slate-50/80 dark:bg-[#18181B]/80 shadow-xs overflow-hidden transition-all">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 dark:hover:bg-[#202024] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
            <Bookmark size={14} className="text-accent" />
            <span>文档元数据</span>
          </div>

          {/* Quick Badges preview */}
          <div className="flex items-center gap-1.5 overflow-hidden text-[11px]">
            {version && (
              <span className="px-1.5 py-0.5 rounded font-mono font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {version}
              </span>
            )}
            {status && (
              <span className="px-1.5 py-0.5 rounded font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                {status}
              </span>
            )}
            {author && (
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <User size={11} />
                <span>{author}</span>
              </span>
            )}
            {date && (
              <span className="hidden md:inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <Calendar size={11} />
                <span>{date}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onEditInSource && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditInSource();
              }}
              className="text-[11px] text-slate-400 hover:text-accent flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white dark:hover:bg-[#27272A] transition-colors"
              title="切换到源码模式编辑 YAML 属性"
            >
              <FileCode size={12} />
              <span>编辑 YAML</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded detailed metadata drawer */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-200/80 dark:border-[#27272A] px-4 py-3 bg-white/70 dark:bg-[#121214]/60 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {title && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">标题 (Title)</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{title}</span>
                </div>
              )}
              {author && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">作者 (Author)</span>
                  <span className="text-slate-700 dark:text-slate-300">{author}</span>
                </div>
              )}
              {version && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">版本 (Version)</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{version}</span>
                </div>
              )}
              {date && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">修订日期 (Date)</span>
                  <span className="text-slate-700 dark:text-slate-300">{date}</span>
                </div>
              )}
              {status && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">状态 (Status)</span>
                  <span className="text-slate-700 dark:text-slate-300">{status}</span>
                </div>
              )}
              {category && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">分类 (Category)</span>
                  <span className="text-slate-700 dark:text-slate-300">{category}</span>
                </div>
              )}
              {Object.entries(customFields).map(([k, v]) => (
                <div key={k}>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">{k}</span>
                  <span className="text-slate-700 dark:text-slate-300">{String(v)}</span>
                </div>
              ))}
            </div>

            {/* Tags Pills */}
            {tags && tags.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#27272A] flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 dark:text-slate-500 text-[11px] flex items-center gap-1">
                  <Tag size={12} />
                  <span>标签：</span>
                </span>
                {tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-[#27272A] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/5"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
