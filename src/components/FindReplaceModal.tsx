import React, { useEffect, useRef, useState } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: any;
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void;
}

export default function FindReplaceModal({
  isOpen,
  onClose,
  editor,
  showToast,
}: FindReplaceModalProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const findInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const buildRegex = (query: string, global = true) => {
    let pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const flags = (global ? 'g' : '') + (caseSensitive ? '' : 'i');
    return new RegExp(pattern, flags);
  };

  // Find all matches in the editor document
  const getMatches = () => {
    if (!editor || !findText.trim()) return [];
    const doc = editor.state.doc;
    const regex = buildRegex(findText.trim());
    const matches: { from: number; to: number; text: string }[] = [];

    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(node.text)) !== null) {
        matches.push({
          from: pos + m.index,
          to: pos + m.index + m[0].length,
          text: m[0],
        });
      }
    });

    return matches;
  };

  useEffect(() => {
    if (!findText.trim()) {
      setMatchCount(0);
      setCurrentMatchIndex(0);
      return;
    }
    const matches = getMatches();
    setMatchCount(matches.length);
    setCurrentMatchIndex(matches.length > 0 ? 1 : 0);
  }, [findText, caseSensitive, wholeWord]);

  const jumpToMatch = (index: number) => {
    const matches = getMatches();
    if (matches.length === 0) return;
    const clampedIndex = (index + matches.length) % matches.length;
    setCurrentMatchIndex(clampedIndex + 1);
    const target = matches[clampedIndex];
    if (target) {
      editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run();
    }
  };

  const handleNext = () => {
    jumpToMatch(currentMatchIndex);
  };

  const handlePrev = () => {
    jumpToMatch(currentMatchIndex - 2);
  };

  const handleReplaceNext = () => {
    if (!editor || !findText.trim()) return;
    const matches = getMatches();
    if (matches.length === 0) {
      showToast?.('未找到匹配项', 'warning');
      return;
    }

    const { from, to } = editor.state.selection;
    let target = matches.find((m) => m.from >= from);
    if (!target) target = matches[0];

    editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, replaceText).run();
    showToast?.('已替换 1 处', 'info');

    setTimeout(() => {
      const remaining = getMatches();
      setMatchCount(remaining.length);
      if (remaining.length > 0) {
        jumpToMatch(0);
      }
    }, 50);
  };

  const handleReplaceAll = () => {
    if (!editor || !findText.trim()) return;
    const matches = getMatches();
    if (matches.length === 0) {
      showToast?.('未找到可替换的匹配项', 'warning');
      return;
    }

    const count = matches.length;
    let tr = editor.state.tr;
    // Replace from bottom to top to preserve positions
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      tr = tr.insertText(replaceText, m.from, m.to);
    }
    editor.view.dispatch(tr);
    showToast?.(`已全部替换完成，共替换 ${count} 处`, 'info');
    setMatchCount(0);
    setCurrentMatchIndex(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/35 backdrop-blur-xs animate-in fade-in duration-150"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg mx-4 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 p-4 flex flex-col gap-3 transition-all"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
            <Replace size={15} className="text-accent" />
            <span>查找与替换 (Ctrl+H)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Find Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={findInputRef}
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) handlePrev();
                  else handleNext();
                }
              }}
              placeholder="查找文本..."
              className="w-full h-8 pl-8 pr-20 rounded-lg text-xs bg-slate-100 dark:bg-[#27272A] text-slate-900 dark:text-white outline-none focus:ring-1 ring-accent"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400">
              {matchCount > 0 ? `${currentMatchIndex} / ${matchCount}` : '无匹配'}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              disabled={matchCount === 0}
              className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 disabled:opacity-40"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={matchCount === 0}
              className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-slate-300 disabled:opacity-40"
              title="下一个 (Enter)"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Replace Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Replace size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleReplaceNext();
                }
              }}
              placeholder="替换为..."
              className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-slate-100 dark:bg-[#27272A] text-slate-900 dark:text-white outline-none focus:ring-1 ring-accent"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReplaceNext}
              disabled={matchCount === 0}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#27272A] disabled:opacity-40"
            >
              替换
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matchCount === 0}
              className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-strong disabled:opacity-40 transition-colors"
            >
              全部替换
            </button>
          </div>
        </div>

        {/* Match Options */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="accent-accent rounded size-3"
              />
              <span>区分大小写</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="accent-accent rounded size-3"
              />
              <span>全词匹配</span>
            </label>
          </div>
          <span className="text-[10px]">Esc 退出</span>
        </div>
      </div>
    </div>
  );
}
