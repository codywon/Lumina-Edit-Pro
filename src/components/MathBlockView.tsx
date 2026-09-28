import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { Check, Copy, Edit3, Trash2, Sigma, AlertCircle, Eye, Code } from 'lucide-react';

export default function MathBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const latex = node.attrs.latex || '';
  const [isEditing, setIsEditing] = useState(!latex.trim());
  const [draftLatex, setDraftLatex] = useState(latex);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft when node attrs change externally
  useEffect(() => {
    setDraftLatex(latex);
  }, [latex]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Render KaTeX HTML for the block formula
  const renderedHtml = useMemo(() => {
    const trimmed = (latex || '').trim();
    if (!trimmed) return null;
    try {
      return {
        html: katex.renderToString(trimmed, {
          throwOnError: false,
          displayMode: true,
        }),
        error: null,
      };
    } catch (err: any) {
      return {
        html: null,
        error: err?.message || 'KaTeX 语法错误',
      };
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
          displayMode: true,
        }),
        error: null,
      };
    } catch (err: any) {
      try {
        return {
          html: katex.renderToString(trimmed, {
            throwOnError: false,
            displayMode: true,
          }),
          error: err?.message || 'LaTeX 语法错误',
        };
      } catch {
        return { html: null, error: err?.message || 'LaTeX 语法错误' };
      }
    }
  }, [draftLatex]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(latex || draftLatex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCommit = () => {
    const trimmed = draftLatex.trim();
    if (!trimmed) {
      deleteNode();
    } else {
      updateAttributes({ latex: trimmed });
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!latex.trim()) {
        deleteNode();
      } else {
        setDraftLatex(latex);
        setIsEditing(false);
      }
    }
  };

  return (
    <NodeViewWrapper
      className={`math-block-wrapper my-6 rounded-xl border border-slate-200/90 dark:border-white/10 bg-slate-50/70 dark:bg-[#18181B]/80 overflow-hidden shadow-xs transition-all group ${
        selected ? 'ring-2 ring-accent' : 'hover:border-slate-300 dark:hover:border-white/20'
      }`}
    >
      {/* Top Header / Action Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-100/80 dark:bg-white/5 border-b border-slate-200/80 dark:border-white/10 select-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Sigma size={14} className="text-accent" />
            <span>数学公式块 (LaTeX)</span>
          </span>
          {latex.trim() && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-mono">
              displayMode
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <button
              type="button"
              onClick={handleCommit}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-accent text-white hover:bg-accent/90 transition-colors shadow-2xs"
            >
              <Check size={12} />
              <span>完成</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
              title="编辑 LaTeX 代码"
            >
              <Edit3 size={12} />
              <span>编辑</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
            title="复制 LaTeX 代码"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>

          <button
            type="button"
            onClick={() => deleteNode()}
            className="p-1.5 text-slate-400 hover:text-rose-500 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="删除公式块"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Main Body */}
      {isEditing ? (
        <div className="p-3.5 space-y-3">
          {/* Textarea Editor */}
          <div>
            <textarea
              ref={textareaRef}
              value={draftLatex}
              onChange={(e) => setDraftLatex(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在此输入 LaTeX 公式代码，例如：
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
或
\begin{aligned}
  a &= b + c \\
  &= d + e
\end{aligned}"
              rows={4}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121214] font-mono text-xs text-slate-800 dark:text-slate-100 resize-y focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent leading-relaxed"
            />
          </div>

          {/* Live Preview Area */}
          <div className="rounded-lg border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#121214]/60 p-4">
            <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
              <Eye size={12} />
              <span>实时渲染预览</span>
            </div>
            {previewHtml?.html ? (
              <div
                className="overflow-x-auto py-2 text-center text-slate-900 dark:text-slate-100"
                dangerouslySetInnerHTML={{ __html: previewHtml.html }}
              />
            ) : (
              <div className="text-center py-4 text-xs text-slate-400 italic">
                {draftLatex.trim() ? '正在解析公式...' : '输入 LaTeX 表达式后在此实时预览'}
              </div>
            )}
            {previewHtml?.error && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                <AlertCircle size={13} className="shrink-0" />
                <span className="font-mono text-[11px]">{previewHtml.error}</span>
              </div>
            )}
          </div>

          {/* Footer Shortcuts hint */}
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>快捷键：Ctrl+Enter 完成编辑 · Esc 退出</span>
            <button
              type="button"
              onClick={handleCommit}
              className="inline-flex items-center gap-1 px-3 py-1 bg-accent text-white font-medium rounded-md shadow-xs hover:bg-accent/90 transition-colors"
            >
              <Check size={12} />
              <span>保存并退出</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="p-6 cursor-pointer hover:bg-slate-100/40 dark:hover:bg-white/5 transition-colors"
          onClick={() => setIsEditing(true)}
          title="双击或点击进行公式编辑"
        >
          {renderedHtml?.html ? (
            <div
              className="overflow-x-auto py-2 text-center text-slate-900 dark:text-slate-100 leading-normal"
              dangerouslySetInnerHTML={{ __html: renderedHtml.html }}
            />
          ) : renderedHtml?.error ? (
            <div className="flex items-center justify-center gap-2 text-rose-500 py-3 text-xs font-mono">
              <AlertCircle size={14} />
              <span>{renderedHtml.error}</span>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-400 text-xs italic">
              点击输入 LaTeX 数学公式
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
