import React, { useState, useRef, useEffect, useId } from 'react';
import { NodeViewContent, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Copy, Check, ChevronDown, Eye, Code, Columns, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const POPULAR_LANGUAGES = [
  'auto',
  'mermaid',
  'latex',
  'math',
  'python',
  'javascript',
  'typescript',
  'bash',
  'json',
  'sql',
  'html',
  'css',
  'rust',
  'go',
  'markdown',
  'yaml',
];

let katexModule: any = null;
async function getKatex() {
  if (!katexModule && typeof window !== 'undefined') {
    const mod = await import('katex');
    katexModule = mod.default || mod;
  }
  return katexModule;
}

let mermaidModule: any = null;
async function getMermaid() {
  if (!mermaidModule && typeof window !== 'undefined') {
    const mod = await import('mermaid');
    mermaidModule = mod.default || mod;
    try {
      mermaidModule.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
      });
    } catch (e) {
      console.warn('Mermaid initialization warning:', e);
    }
  }
  return mermaidModule;
}

export default function CodeBlockComponent({
  node,
  updateAttributes,
  extension,
}: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const rawLanguage = (node.attrs.language || 'auto').toLowerCase();
  const isMermaid = rawLanguage === 'mermaid';
  const isMath = rawLanguage === 'math' || rawLanguage === 'latex' || rawLanguage === 'katex';
  const isVisual = isMermaid || isMath;

  const [activeView, setActiveView] = useState<'code' | 'preview' | 'split'>('split');
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);

  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const availableLanguages = extension?.options?.lowlight?.listLanguages?.() ?? [];
  const mergedLanguages = Array.from(new Set([...POPULAR_LANGUAGES, ...availableLanguages]));

  const handleCopy = () => {
    navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live render for Mermaid
  useEffect(() => {
    if (!isMermaid) {
      setMermaidSvg('');
      setRenderError(null);
      return;
    }

    const text = node.textContent.trim();
    if (!text) {
      setMermaidSvg('');
      setRenderError(null);
      return;
    }

    let isMounted = true;

    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        if (!mermaid) return;
        const renderResult = await mermaid.render(`${diagramId}-${Date.now()}`, text);
        if (isMounted) {
          setMermaidSvg(renderResult.svg);
          setRenderError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setRenderError(err?.message || 'Mermaid 语法格式错误，正在编辑...');
        }
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [node.textContent, isMermaid, diagramId]);

  // Live render for Math (async lazy-loaded)
  const [mathHtml, setMathHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!isMath) {
      setMathHtml(null);
      return;
    }
    const text = node.textContent.trim();
    if (!text) {
      setMathHtml(null);
      return;
    }

    let active = true;
    void getKatex().then((k) => {
      if (!active || !k) return;
      try {
        const html = k.renderToString(text, {
          displayMode: true,
          throwOnError: false,
        });
        setMathHtml(html);
      } catch (err: any) {
        setMathHtml(`<span class="text-rose-400 text-xs">${err?.message || 'KaTeX 语法错误'}</span>`);
      }
    });

    return () => {
      active = false;
    };
  }, [node.textContent, isMath]);

  return (
    <NodeViewWrapper className="code-block relative group my-6 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-[#282c34] shadow-xl">
      {/* Mac-style Header */}
      <div className="code-block-header flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-white/5 select-none">
        <div className="flex items-center gap-2">
          <div className="code-block-dots flex gap-1.5">
            <div className="size-3 rounded-full bg-[#ff5f56] shadow-inner"></div>
            <div className="size-3 rounded-full bg-[#ffbd2e] shadow-inner"></div>
            <div className="size-3 rounded-full bg-[#27c93f] shadow-inner"></div>
          </div>
          <div className="h-3 w-px bg-white/10 mx-1"></div>

          {/* Custom Language Dropdown */}
          <div className="code-block-lang relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-300 font-semibold tracking-wider hover:text-white transition-colors rounded hover:bg-white/5"
            >
              <span className="uppercase">{node.attrs.language || 'auto'}</span>
              <ChevronDown size={10} className={isDropdownOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 mt-1 w-44 max-h-60 overflow-y-auto bg-[#21252b] border border-white/10 rounded-md shadow-2xl z-50 custom-scrollbar"
                >
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">常用类型</div>
                  {POPULAR_LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        updateAttributes({ language: lang });
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                        (node.attrs.language || 'auto') === lang
                          ? 'bg-accent text-white font-bold'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                  <div className="h-px bg-white/5 mx-2 my-1"></div>
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-wider">全部语法</div>
                  {mergedLanguages
                    .filter((lang) => !POPULAR_LANGUAGES.includes(lang))
                    .map((lang: string) => (
                      <button
                        key={lang}
                        onClick={() => {
                          updateAttributes({ language: lang });
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                          node.attrs.language === lang
                            ? 'bg-accent text-white font-bold'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Visual Diagram / Math View Mode Toggles */}
          {isVisual && (
            <div className="flex items-center bg-black/30 p-0.5 rounded-lg border border-white/10 ml-2">
              <button
                type="button"
                onClick={() => setActiveView('code')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeView === 'code' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="纯源码模式"
              >
                <Code size={11} /> 源码
              </button>
              <button
                type="button"
                onClick={() => setActiveView('split')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeView === 'split' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="分屏对照"
              >
                <Columns size={11} /> 分屏
              </button>
              <button
                type="button"
                onClick={() => setActiveView('preview')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  activeView === 'preview' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="预览视图"
              >
                <Eye size={11} /> 预览
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="code-block-copy p-1 text-slate-400 hover:text-white transition-all active:scale-90 rounded hover:bg-white/5"
          title="复制代码"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>

      {/* Editor & Preview Area */}
      <div className={`relative ${isVisual && activeView === 'split' ? 'grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10' : ''}`}>
        {/* Code Input (Always mounted so TipTap / ProseMirror stays in sync) */}
        <div
          className={`${
            isVisual && activeView === 'preview'
              ? 'opacity-0 h-0 overflow-hidden pointer-events-none'
              : 'relative bg-transparent'
          }`}
        >
          <pre className="px-5 py-3.5 m-0 text-sm font-mono leading-relaxed bg-transparent text-[#abb2bf] whitespace-pre-wrap break-words overflow-x-hidden custom-scrollbar outline-none">
            <NodeViewContent as="div" className="font-mono bg-transparent" />
          </pre>
        </div>

        {/* Visual Render Preview */}
        {isVisual && (activeView === 'preview' || activeView === 'split') && (
          <div className="p-4 bg-[#1e2227] flex flex-col items-center justify-center min-h-[120px] overflow-auto custom-scrollbar">
            {renderError ? (
              <div className="flex items-center gap-2 text-xs text-amber-400/90 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
                <AlertCircle size={14} className="shrink-0" />
                <span>{renderError}</span>
              </div>
            ) : isMermaid && mermaidSvg ? (
              <div
                className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            ) : isMath && mathHtml ? (
              <div
                className="w-full py-2 text-center text-slate-100 overflow-x-auto custom-scrollbar"
                dangerouslySetInnerHTML={{ __html: mathHtml }}
              />
            ) : (
              <div className="text-xs text-slate-500 italic">
                {isMermaid ? '输入 Mermaid 语法以生成图表...' : '输入 LaTeX 表达式以渲染公式...'}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
