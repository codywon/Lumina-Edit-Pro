import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { Check, X, Trash2, Sigma, AlertCircle, CornerDownLeft } from 'lucide-react';

export default function MathInlineView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const latex = node.attrs.latex || '';
  const [isEditing, setIsEditing] = useState(false);
  const [draftLatex, setDraftLatex] = useState(latex);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when node attrs change externally
  useEffect(() => {
    setDraftLatex(latex);
  }, [latex]);

  // Render KaTeX HTML for the inline formula
  const renderedHtml = useMemo(() => {
    const trimmed = (latex || '').trim();
    if (!trimmed) {
      return null;
    }
    try {
      return katex.renderToString(trimmed, {
        throwOnError: false,
        displayMode: false,
      });
    } catch (err: any) {
      return null;
    }
  }, [latex]);

  // Render live preview for the editing draft
  const previewHtml = useMemo(() => {
    const trimmed = (draftLatex || '').trim();
    if (!trimmed) return null;
    try {
      return {
        html: katex.renderToString(trimmed, {
          throwOnError: true,
          displayMode: false,
        }),
        error: null,
      };
    } catch (err: any) {
      // Return raw string with error message
      try {
        return {
          html: katex.renderToString(trimmed, {
            throwOnError: false,
            displayMode: false,
          }),
          error: err?.message || 'LaTeX 语法错误',
        };
      } catch {
        return { html: null, error: err?.message || 'LaTeX 语法错误' };
      }
    }
  }, [draftLatex]);

  // Position the popover when opening
  const updatePosition = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const popoverWidth = 340;
    const popoverHeight = 170;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - popoverWidth - 16));

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popoverHeight + 20 && rect.top > popoverHeight + 20;

    const top = placeAbove
      ? rect.top - popoverHeight - 8
      : rect.bottom + 8;

    setPopoverPos({ top, left, placeAbove });
  };

  useLayoutEffect(() => {
    if (isEditing) {
      updatePosition();
    }
  }, [isEditing, draftLatex]);

  // Focus input on edit open
  useEffect(() => {
    if (isEditing) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  // Handle click outside to commit
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        wrapperRef.current &&
        !wrapperRef.current.contains(target)
      ) {
        handleCommit();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isEditing, draftLatex]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftLatex(latex);
    setIsEditing(true);
  };

  const handleCommit = () => {
    const trimmed = draftLatex.trim();
    if (!trimmed) {
      deleteNode();
    } else {
      updateAttributes({ latex: trimmed });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftLatex(latex);
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteNode();
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      className={`math-inline-wrapper inline-flex items-center align-baseline cursor-pointer select-none rounded px-1 py-0.5 transition-all duration-150 mx-0.5 ${
        selected
          ? 'ring-2 ring-accent bg-accent/10'
          : 'hover:bg-slate-200/60 dark:hover:bg-white/10 hover:shadow-2xs'
      }`}
      onClick={handleStartEdit}
      title="点击编辑行内公式"
    >
      {renderedHtml ? (
        <span
          className="math-inline-content inline"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
          <Sigma size={12} />
          <span>{latex ? `[公式: ${latex}]` : '[空公式]'}</span>
        </span>
      )}

      {/* Floating Popover Editor */}
      {isEditing && popoverPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              width: '340px',
              zIndex: 9999,
            }}
            className="math-popover rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1C1C20] shadow-2xl p-3.5 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                <Sigma size={14} />
                <span>LaTeX 行内公式</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  title="删除公式"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  title="取消"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Input field */}
            <div className="relative mb-2">
              <input
                ref={inputRef}
                type="text"
                value={draftLatex}
                onChange={(e) => setDraftLatex(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="例如: I_e, E = mc^2, \frac{a}{b}"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121214] font-mono text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Live Preview */}
            <div className="min-h-[38px] max-h-[70px] overflow-auto px-2.5 py-1.5 rounded-lg bg-slate-100/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 flex items-center justify-center mb-2.5">
              {previewHtml?.html ? (
                <div
                  className="text-center overflow-x-auto text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml.html }}
                />
              ) : (
                <span className="text-[11px] text-slate-400 italic">实时公式预览</span>
              )}
            </div>

            {/* Error notice if any */}
            {previewHtml?.error && (
              <div className="flex items-center gap-1 text-[11px] text-amber-500 mb-2 truncate">
                <AlertCircle size={11} className="shrink-0" />
                <span className="truncate">{previewHtml.error}</span>
              </div>
            )}

            {/* Actions bar */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 text-[10px]">Enter 确定 · Esc 取消</span>
              <button
                type="button"
                onClick={handleCommit}
                className="inline-flex items-center gap-1 px-3 py-1 bg-accent text-white font-medium rounded-md shadow-xs hover:bg-accent/90 transition-colors"
              >
                <Check size={12} />
                <span>完成</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
