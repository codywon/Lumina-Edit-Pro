import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Search, ChevronUp, ChevronDown, Minus, Square, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSettings } from '../contexts/SettingsContext';
import { marked } from 'marked';
import { createMarkedKatexExtension } from '../lib/markedKatex';
import BrandIcon from './BrandIcon';

marked.use(createMarkedKatexExtension());
import { formatPanguSpacing } from '../lib/pangu';
import { extractDocumentBaseName, saveExportedBytes } from '../lib/exportSave';

interface HeaderProps {
  viewMode: 'wysiwyg' | 'source' | 'split';
  setViewMode: (mode: 'wysiwyg' | 'source' | 'split') => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
  leftPanelOpen: boolean;
  setLeftPanelOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenAICenter: () => void;
  onOpenAbout: () => void;
  content: string;
  showToast: (message: string, level?: 'info' | 'warning' | 'error') => void;
  onSave: () => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSearch: (query: string) => void;
  searchOptions: { caseSensitive: boolean; wholeWord: boolean };
  searchMatchCount: number;
  searchActiveMatchIndex: number;
  onSearchNavigate: (direction: 'next' | 'prev') => void;
  onSearchOptionsChange: (partial: { caseSensitive?: boolean; wholeWord?: boolean }) => void;
  isToolbarVisible: boolean;
  setIsToolbarVisible: (visible: boolean) => void;
  onToggleFullscreen: () => void;
  onToggleFocusMode: () => void;
  onWindowMinimize: () => void;
  onWindowToggleMaximize: () => void;
  onWindowClose: () => void;
  onWindowStartDrag: () => void;
  editor: any;
  onInsertImage?: () => void | Promise<void>;
  onQuickOpen?: () => void;
  onOpenReplace?: () => void;
  onOpenManual?: () => void;
  onOpenExportDocx?: () => void;
  onOpenTimeline?: () => void;
  onCheckUpdate?: () => void;
}

function HeaderComponent({ 
  viewMode, 
  setViewMode, 
  aiPanelOpen, 
  setAiPanelOpen, 
  leftPanelOpen, 
  setLeftPanelOpen,
  onOpenSettings,
  onOpenAICenter,
  onOpenAbout,
  content,
  showToast,
  onSave,
  onNewFile,
  onOpenFile,
  onSearch,
  searchOptions,
  searchMatchCount,
  searchActiveMatchIndex,
  onSearchNavigate,
  onSearchOptionsChange,
  isToolbarVisible,
  setIsToolbarVisible,
  onToggleFullscreen,
  onToggleFocusMode,
  onWindowMinimize,
  onWindowToggleMaximize,
  onWindowClose,
  onWindowStartDrag,
  editor,
  onInsertImage,
  onQuickOpen,
  onOpenReplace,
  onOpenManual,
  onOpenExportDocx,
  onOpenTimeline,
  onCheckUpdate,
}: HeaderProps) {
  const { settings } = useSettings();
  const handlePanguSpacing = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to, '\n');
      const formatted = formatPanguSpacing(selectedText);
      editor.chain().focus().insertContentAt({ from, to }, formatted).run();
      showToast('已完成选中内容的中英文排版规范化', 'info');
    } else {
      const currentMd = (editor.storage as any).markdown?.getMarkdown?.();
      if (typeof currentMd === 'string') {
        const formatted = formatPanguSpacing(currentMd);
        editor.commands.setContent(formatted);
        showToast('已完成全文中英文排版规范化', 'info');
      }
    }
  };
  const handleExportLongImage = async () => {
    const editorDom = document.querySelector('.printable-content') as HTMLElement;
    if (!editorDom) {
      showToast('未找到可导出的正文内容', 'warning');
      return;
    }
    const baseName = extractDocumentBaseName(content, 'Lumina-Document');
    try {
      const { exportElementToLongImage } = await import('../lib/exportImage');
      await exportElementToLongImage(editorDom, `${baseName}.png`, showToast);
    } catch (err: any) {
      showToast(err?.message || '导出长图失败', 'error');
    }
  };
  const handleExport = async (format: 'html' | 'pdf' | 'md') => {
    const baseName = extractDocumentBaseName(content, 'Lumina-Document');
    
    if (format === 'html') {
      const htmlBody = marked.parse(content);
      const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${baseName}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        if (window.mermaid) {
          mermaid.initialize({ startOnLoad: true, theme: 'default' });
        }
      });
    </script>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        font-family: "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif;
        color: #0f172a;
        background: #ffffff;
        margin: 0;
        padding: 32px 24px;
        line-height: 1.7;
      }
      .markdown-body {
        max-width: 900px;
        margin: 0 auto;
      }
      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4 {
        line-height: 1.3;
      }
      .markdown-body h1 { margin: 2.2rem 0 1rem; font-size: 2rem; }
      .markdown-body h2 { margin: 2rem 0 0.9rem; font-size: 1.5rem; }
      .markdown-body h3 { margin: 1.6rem 0 0.7rem; font-size: 1.25rem; }
      .markdown-body p { margin: 0.85rem 0; }
      .markdown-body ul,
      .markdown-body ol { margin: 0.8rem 0 0.8rem 1.2rem; }
      .markdown-body li { margin: 0.35rem 0; }
      .markdown-body blockquote {
        border-left: 4px solid #ec5b13;
        background: #fff7f2;
        padding: 0.4rem 1rem;
        margin: 1rem 0;
        color: #475569;
      }
      .markdown-body code {
        background: #f1f5f9;
        padding: 0.15rem 0.35rem;
        border-radius: 4px;
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
        font-size: 0.95em;
      }
      .markdown-body pre {
        position: relative;
        background: #282c34;
        color: #e2e8f0;
        padding: 2.6rem 1.25rem 1.2rem;
        border-radius: 14px;
        margin: 1.2rem 0;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
      }
      .markdown-body pre::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 32px;
        background: #21252b;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        border-top-left-radius: 14px;
        border-top-right-radius: 14px;
      }
      .markdown-body pre::after {
        content: "";
        position: absolute;
        top: 10px;
        left: 14px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #ff5f56;
        box-shadow: 16px 0 0 #ffbd2e, 32px 0 0 #27c93f;
      }
      .markdown-body pre code {
        background: transparent;
        padding: 0;
        color: inherit;
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .markdown-body table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
        font-size: 0.95rem;
      }
      .markdown-body th,
      .markdown-body td {
        border: 1px solid #e2e8f0;
        padding: 0.5rem 0.75rem;
        text-align: left;
      }
      .markdown-body img {
        max-width: 100%;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
      }
      .markdown-body hr {
        border: none;
        border-top: 1px solid #e2e8f0;
        margin: 2rem 0;
      }
      .markdown-body a {
        color: #ec5b13;
        text-decoration: none;
      }
      .markdown-body a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <article class="markdown-body">
      ${htmlBody}
    </article>
  </body>
</html>`;
      await saveExportedBytes({
        bytes: new TextEncoder().encode(html),
        defaultFileName: `${baseName}.html`,
        filterName: 'HTML 网页文档 (*.html)',
        extensions: ['html'],
        mimeType: 'text/html;charset=utf-8',
        showToast,
        successLabel: ' HTML 网页',
      });
    } else if (format === 'pdf') {
      const originalTitle = document.title;
      // Pre-fill document.title so print-to-PDF automatically defaults the filename to `${baseName}.pdf`
      document.title = baseName;
      showToast('如需纯净正文，请在打印选项【更多设置】中取消勾选【页眉和页脚】', 'info');
      try {
        window.print();
      } finally {
        setTimeout(() => {
          document.title = originalTitle;
        }, 1500);
      }
    } else {
      await saveExportedBytes({
        bytes: new TextEncoder().encode(content),
        defaultFileName: `${baseName}.md`,
        filterName: 'Markdown 文档 (*.md)',
        extensions: ['md'],
        mimeType: 'text/markdown;charset=utf-8',
        showToast,
        successLabel: ' Markdown 文档',
      });
    }
  };

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const searchDebounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const menuBarRef = useRef<HTMLElement | null>(null);
  const menuDragStartRef = useRef<{ x: number; y: number; started: boolean } | null>(null);
  const suppressNextMenuClickRef = useRef(false);
  const titlebarPointerRef = useRef<{ time: number; x: number; y: number; target: EventTarget | null } | null>(null);

  const focusSearchInput = () => {
    searchInputRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  const menuGroups = [
    {
      label: '文件',
      items: [
        { label: '快速打开...', shortcut: 'Ctrl+P', action: () => onQuickOpen?.() },
        { label: '新建文件', shortcut: settings.shortcuts.newFile, action: onNewFile },
        { label: '打开文件', shortcut: settings.shortcuts.openFile, action: onOpenFile },
        { label: '保存', shortcut: settings.shortcuts.saveFile, action: onSave },
        { label: '时光机...', action: () => onOpenTimeline?.() },
        { label: '打印', shortcut: '', action: () => window.print() },
        { label: '导出为PDF', action: () => handleExport('pdf') },
        { label: '导出为Word', action: () => {
          if (onOpenExportDocx) {
            onOpenExportDocx();
          } else {
            void (async () => {
              const { exportMarkdownToDocx } = await import('../lib/exportDocx');
              await exportMarkdownToDocx(content, undefined, showToast);
            })();
          }
        } },
        { label: '导出为HTML', action: () => handleExport('html') },
        { label: '导出为长图', action: handleExportLongImage },
        { label: '导出为Markdown', action: () => handleExport('md') },
      ],
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: () => editor?.chain().focus().undo().run() },
        { label: '重做', shortcut: 'Ctrl+Y', action: () => editor?.chain().focus().redo().run() },
        { label: '全选', shortcut: 'Ctrl+A', action: () => editor?.chain().focus().selectAll().run() },
        { label: '查找当前文档', shortcut: 'Ctrl+F', action: focusSearchInput },
        { label: '查找与替换', shortcut: 'Ctrl+H', action: () => onOpenReplace?.() },
      ],
    },
    {
      label: '视图',
      items: [
        { label: '所见即所得', shortcut: 'Alt+1', action: () => setViewMode('wysiwyg') },
        { label: '源码模式', shortcut: settings.shortcuts.toggleSourceMode, action: () => setViewMode('source') },
        { label: '分屏预览', shortcut: 'Alt+3', action: () => setViewMode('split') },
        { label: '全屏', shortcut: settings.shortcuts.toggleFullscreen, action: onToggleFullscreen },
        { label: settings.focusMode ? '退出专注模式' : '专注模式', shortcut: settings.shortcuts.toggleFocusMode, action: onToggleFocusMode },
        { label: isToolbarVisible ? '隐藏编辑工具栏' : '显示编辑工具栏', shortcut: settings.shortcuts.toggleToolbar, action: () => setIsToolbarVisible(!isToolbarVisible) },
        { label: leftPanelOpen ? '收起左侧大纲' : '展开左侧大纲', action: () => setLeftPanelOpen(!leftPanelOpen) },
        { label: aiPanelOpen ? '关闭 AI 助手' : '开启 AI 助手', action: () => setAiPanelOpen(!aiPanelOpen) },
      ],
    },
    {
      label: '插入',
      items: [
        {
          label: '图片',
          shortcut: settings.shortcuts.image,
          action: () => {
            void onInsertImage?.();
          },
        },
        { label: '表格', shortcut: settings.shortcuts.table, action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
        {
          label: '超链接',
          shortcut: settings.shortcuts.link,
          action: () => {
            const url = window.prompt('链接地址');
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          },
        },
        { label: '代码块', shortcut: settings.shortcuts.codeBlock, action: () => editor?.chain().focus().toggleCodeBlock().run() },
        { label: '数学公式块', shortcut: 'Ctrl+Shift+M', action: () => editor?.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run() },
        { label: '行内公式', shortcut: 'Ctrl+M', action: () => editor?.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: 'x' } }).run() },
        { label: '待办清单', action: () => editor?.chain().focus().toggleTaskList().run() },
        { label: '分割线', action: () => editor?.chain().focus().setHorizontalRule().run() },
      ],
    },
    {
      label: '格式',
      items: [
        { label: '加粗', shortcut: settings.shortcuts.bold, action: () => editor?.chain().focus().toggleBold().run() },
        { label: '斜体', shortcut: settings.shortcuts.italic, action: () => editor?.chain().focus().toggleItalic().run() },
        { label: '删除线', shortcut: settings.shortcuts.strike, action: () => editor?.chain().focus().toggleStrike().run() },
        { label: '文本高亮', action: () => editor?.chain().focus().toggleHighlight().run() },
        { label: '行内代码', shortcut: settings.shortcuts.inlineCode, action: () => editor?.chain().focus().toggleCode().run() },
        { label: '行内公式', shortcut: 'Ctrl+M', action: () => editor?.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: 'x' } }).run() },
        { label: '数学公式块', shortcut: 'Ctrl+Shift+M', action: () => editor?.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run() },
        { label: '引用', shortcut: settings.shortcuts.blockquote, action: () => editor?.chain().focus().toggleBlockquote().run() },
        { label: '分割线', action: () => editor?.chain().focus().setHorizontalRule().run() },
        { label: '无序列表', shortcut: settings.shortcuts.unorderedList, action: () => editor?.chain().focus().toggleBulletList().run() },
        { label: '有序列表', shortcut: settings.shortcuts.orderedList, action: () => editor?.chain().focus().toggleOrderedList().run() },
        { label: '待办任务', action: () => editor?.chain().focus().toggleTaskList().run() },
        { label: '一级标题', shortcut: settings.shortcuts.heading1, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
        { label: '二级标题', shortcut: settings.shortcuts.heading2, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
        { label: '三级标题', shortcut: settings.shortcuts.heading3, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
        { label: '中英文排版规范化', action: handlePanguSpacing },
        { label: '清除格式', action: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
      ],
    },
    {
      label: '设置',
      items: [
        { label: '通用设置', action: onOpenSettings },
        { label: 'AI 能力中心', action: onOpenAICenter },
      ],
    },
    {
      label: '帮助',
      items: [
        { label: '检查更新...', action: () => onCheckUpdate?.() },
        { label: '操作手册', action: () => onOpenManual?.() },
        { label: '关于', action: onOpenAbout },
      ],
    },
  ] as const;

  const handleTitlebarPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button > 0 || !(event.target instanceof Element)) {
      return;
    }

    const interactiveTarget = event.target.closest(
      'button, input, textarea, select, a, [role="button"], [data-titlebar-interactive="true"]'
    );

    if (interactiveTarget) {
      return;
    }

    const clickCount = event.detail || event.nativeEvent.detail || 0;
    if (clickCount >= 2) {
      event.preventDefault();
      titlebarPointerRef.current = null;
      onWindowToggleMaximize();
      return;
    }

    const now = Date.now();
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const previousPointer = titlebarPointerRef.current;
    if (
      previousPointer &&
      previousPointer.target === event.target &&
      now - previousPointer.time < 350 &&
      Math.abs(pointerX - previousPointer.x) < 6 &&
      Math.abs(pointerY - previousPointer.y) < 6
    ) {
      event.preventDefault();
      titlebarPointerRef.current = null;
      onWindowToggleMaximize();
      return;
    }

    titlebarPointerRef.current = {
      time: now,
      x: pointerX,
      y: pointerY,
      target: event.target,
    };
    onWindowStartDrag();
  };

  const handleMenuPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button > 0) {
      return;
    }

    menuDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      started: false,
    };
    suppressNextMenuClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleMenuPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragStart = menuDragStartRef.current;
    if (!dragStart || dragStart.started) {
      return;
    }

    const deltaX = Math.abs(event.clientX - dragStart.x);
    const deltaY = Math.abs(event.clientY - dragStart.y);
    if (deltaX < 6 && deltaY < 6) {
      return;
    }

    dragStart.started = true;
    suppressNextMenuClickRef.current = true;
    setActiveMenu(null);
    onWindowStartDrag();
  };

  const handleMenuPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    menuDragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const handleMenuClick = (groupLabel: string) => {
    if (suppressNextMenuClickRef.current) {
      suppressNextMenuClickRef.current = false;
      return;
    }

    setActiveMenu(activeMenu === groupLabel ? null : groupLabel);
  };

  return (
    <header
      aria-label="应用标题栏"
      data-tauri-drag-region
      onPointerDown={handleTitlebarPointerDown}
      className="app-titlebar print-hide flex h-11 shrink-0 items-center justify-between border-b border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#0E0E11] pl-3 pr-0 z-50 transition-colors duration-200"
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-3 shrink-0">
        <div
          aria-label="应用品牌拖拽区"
          data-tauri-drag-region
          className="flex items-center gap-2 text-accent"
        >
          <BrandIcon data-tauri-drag-region size="sm" />
          <h2 data-tauri-drag-region className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Lumina Edit Pro</h2>
        </div>
        
        <div className="h-4 w-px bg-slate-200 dark:bg-[#27272A] mx-2 transition-colors duration-200"></div>
        
        <nav ref={menuBarRef} aria-label="主菜单" className="hidden md:flex items-center gap-1">
          {menuGroups.map((group) => (
            <div key={group.label} className="relative">
              <button
                onPointerDown={handleMenuPointerDown}
                onPointerMove={handleMenuPointerMove}
                onPointerUp={handleMenuPointerUp}
                onPointerCancel={handleMenuPointerUp}
                onClick={() => handleMenuClick(group.label)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] rounded-md transition-colors"
              >
                {group.label}
              </button>
              {activeMenu === group.label && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md shadow-lg py-1 z-50">
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => { item.action(); setActiveMenu(null); }}
                      className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] transition-colors"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-4">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      <div
        aria-label="标题栏空白拖拽区"
        data-tauri-drag-region
        className="hidden min-w-6 flex-1 self-stretch md:block"
      />

      <div className="flex min-w-0 items-center gap-1.5 shrink-0 h-full">
        <form
          aria-label="文档搜索"
          role="search"
          className="relative hidden lg:flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchDebounceRef.current !== null) {
              window.clearTimeout(searchDebounceRef.current);
            }
            onSearch(searchInput.trim());
          }}
          onFocus={(event) => {
            if (event.currentTarget.contains(event.target as Node)) {
              setSearchActive(true);
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setSearchActive(false);
            }
          }}
        >
          <label htmlFor="document-search" className="sr-only">搜索当前文档</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="document-search"
              type="search"
              value={searchInput}
              placeholder="搜索当前文档"
              aria-label="搜索当前文档"
              ref={searchInputRef}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchInput(nextValue);

                if (searchDebounceRef.current !== null) {
                  window.clearTimeout(searchDebounceRef.current);
                }

                const trimmed = nextValue.trim();
                if (trimmed === '') {
                  onSearch('');
                  return;
                }

                searchDebounceRef.current = window.setTimeout(() => {
                  onSearch(trimmed);
                }, 250);
              }}
              className={cn(
                "h-8 rounded-md border border-transparent dark:border-[#27272A] bg-slate-100 dark:bg-[#18181B] pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus-border-accent focus:ring-1 ring-accent transition-all outline-none",
                searchActive || searchInput.trim() ? "w-72" : "w-48"
              )}
            />
          </div>
          {(searchActive || searchInput.trim()) && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onSearchNavigate('prev');
                  focusSearchInput();
                }}
                disabled={searchMatchCount === 0}
                aria-label="上一个匹配"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border text-slate-500 transition-colors",
                  searchMatchCount === 0
                    ? "border-transparent opacity-40 cursor-not-allowed"
                    : "border-slate-200 bg-white hover:border-accent hover:text-accent dark:border-[#27272A] dark:bg-[#18181B] dark:hover:border-accent"
                )}
                title="上一个匹配"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSearchNavigate('next');
                  focusSearchInput();
                }}
                disabled={searchMatchCount === 0}
                aria-label="下一个匹配"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md border text-slate-500 transition-colors",
                  searchMatchCount === 0
                    ? "border-transparent opacity-40 cursor-not-allowed"
                    : "border-slate-200 bg-white hover:border-accent hover:text-accent dark:border-[#27272A] dark:bg-[#18181B] dark:hover:border-accent"
                )}
                title="下一个匹配"
              >
                <ChevronDown size={14} />
              </button>
              <span
                className="min-w-[42px] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center text-[10px] font-medium text-slate-500 dark:border-[#27272A] dark:bg-[#18181B] dark:text-slate-400"
                aria-label="搜索匹配位置"
              >
                {searchMatchCount > 0 ? `${Math.min(Math.max(searchActiveMatchIndex, 1), searchMatchCount)} / ${searchMatchCount}` : '0 / 0'}
              </span>
              <button
                type="button"
                onClick={() => {
                  onSearchOptionsChange({ caseSensitive: !searchOptions.caseSensitive });
                  focusSearchInput();
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors",
                  searchOptions.caseSensitive
                    ? "border-accent text-accent bg-accent-soft"
                    : "border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                )}
                title="大小写匹配"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => {
                  onSearchOptionsChange({ wholeWord: !searchOptions.wholeWord });
                  focusSearchInput();
                }}
                className={cn(
                  "px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors",
                  searchOptions.wholeWord
                    ? "border-accent text-accent bg-accent-soft"
                    : "border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                )}
                title="全词匹配"
              >
                W
              </button>
            </div>
          )}
        </form>

        <div className="flex items-center gap-1">
          {settings.enableAI && (
            <button 
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                aiPanelOpen 
                  ? "text-purple-500 bg-purple-50 dark:bg-purple-500/10" 
                  : "text-slate-500 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
              )}
              title={aiPanelOpen ? "关闭 AI 助手" : "开启 AI 助手"}
            >
              <Sparkles size={16} />
            </button>
          )}
        </div>

        <div className="flex h-full items-center ml-2 border-l border-slate-200 dark:border-[#27272A]">
          <button
            type="button"
            onClick={onWindowMinimize}
            aria-label="最小化窗口"
            title="最小化窗口"
            className="flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#27272A] dark:hover:text-white"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            onClick={onWindowToggleMaximize}
            aria-label="最大化或还原窗口"
            title="最大化或还原窗口"
            className="flex h-full w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#27272A] dark:hover:text-white"
          >
            <Square size={12} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onWindowClose}
            aria-label="关闭窗口"
            title="关闭窗口"
            className="flex h-full w-12 items-center justify-center text-slate-500 transition-colors hover:bg-[#e81123] hover:text-white dark:text-slate-400 dark:hover:bg-[#e81123] dark:hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default React.memo(HeaderComponent);
