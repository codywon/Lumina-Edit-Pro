import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Clock, Folder, CornerDownLeft } from 'lucide-react';
import type { WorkspaceEntry, WorkspaceFileEntry } from '../lib/fileSystem';
import { cn } from '../lib/utils';

interface RecentFile {
  name: string;
  handle?: any;
}

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceEntries: WorkspaceEntry[];
  recentFiles: RecentFile[];
  onOpenWorkspaceFile: (entry: WorkspaceFileEntry) => void;
  onOpenRecentFile: (file: RecentFile) => void;
}

interface SearchableItem {
  id: string;
  name: string;
  path?: string;
  source: 'workspace' | 'recent';
  workspaceEntry?: WorkspaceFileEntry;
  recentFile?: RecentFile;
}

function flattenWorkspaceFiles(entries: WorkspaceEntry[], acc: WorkspaceFileEntry[] = []): WorkspaceFileEntry[] {
  for (const item of entries) {
    if (item.kind === 'file') {
      acc.push(item);
    } else if (item.kind === 'directory' && item.children) {
      flattenWorkspaceFiles(item.children, acc);
    }
  }
  return acc;
}

export default function QuickOpenModal({
  isOpen,
  onClose,
  workspaceEntries,
  recentFiles,
  onOpenWorkspaceFile,
  onOpenRecentFile,
}: QuickOpenModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allItems = useMemo<SearchableItem[]>(() => {
    const list: SearchableItem[] = [];
    const seenNames = new Set<string>();

    const wsFiles = flattenWorkspaceFiles(workspaceEntries);
    for (const f of wsFiles) {
      list.push({
        id: `ws-${f.path}`,
        name: f.name,
        path: f.path,
        source: 'workspace',
        workspaceEntry: f,
      });
      seenNames.add(f.name);
    }

    for (const r of recentFiles) {
      if (!seenNames.has(r.name)) {
        list.push({
          id: `recent-${r.name}`,
          name: r.name,
          source: 'recent',
          recentFile: r,
        });
      }
    }

    return list;
  }, [workspaceEntries, recentFiles]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 30);

    return allItems
      .filter((item) => {
        const nameMatch = item.name.toLowerCase().includes(q);
        const pathMatch = item.path ? item.path.toLowerCase().includes(q) : false;
        return nameMatch || pathMatch;
      })
      .slice(0, 30);
  }, [allItems, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectItem = (item: SearchableItem) => {
    if (item.source === 'workspace' && item.workspaceEntry) {
      onOpenWorkspaceFile(item.workspaceEntry);
    } else if (item.source === 'recent' && item.recentFile) {
      onOpenRecentFile(item.recentFile);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelectItem(filteredItems[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl mx-4 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[60vh] transition-all"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200/80 dark:border-white/10 gap-3">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工作区文档或近期文件..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 select-none">
            ESC 退出
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-1.5 divide-y divide-transparent">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              未找到匹配的 Markdown 文档
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-colors",
                    isSelected
                      ? "bg-accent-soft text-accent font-medium shadow-xs"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.source === 'workspace' ? (
                      <FileText size={15} className={isSelected ? "text-accent shrink-0" : "text-slate-400 shrink-0"} />
                    ) : (
                      <Clock size={15} className={isSelected ? "text-accent shrink-0" : "text-slate-400 shrink-0"} />
                    )}
                    <span className="truncate">{item.name}</span>
                    {item.path && (
                      <span className="truncate text-[11px] text-slate-400 font-normal ml-1">
                        {item.path}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <span className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 font-mono">
                      {item.source === 'workspace' ? '工作区' : '最近'}
                    </span>
                    {isSelected && <CornerDownLeft size={13} className="text-accent ml-1" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-[#121215] flex items-center justify-between text-[11px] text-slate-400 select-none">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-white dark:bg-[#27272A] border border-slate-200 dark:border-white/10 px-1 rounded">↑↓</kbd> 选择</span>
            <span><kbd className="font-mono bg-white dark:bg-[#27272A] border border-slate-200 dark:border-white/10 px-1.5 rounded">↵</kbd> 打开</span>
          </div>
          <span>共 {filteredItems.length} 个文件</span>
        </div>
      </div>
    </div>
  );
}
