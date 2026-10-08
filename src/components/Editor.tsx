import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, Node as TiptapNode, mergeAttributes } from '@tiptap/react';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Table } from '@tiptap/extension-table';
import { TableMap } from '@tiptap/pm/tables';
import { Bold, Italic, List, Link, Image as ImageIcon, Code, Code2, Columns, Heading as HeadingIcon, Quote, Table as TableIcon, ListOrdered, Strikethrough, SlidersHorizontal, ChevronDown, ChevronUp, Rows, Eye, Focus, Minus, Loader2, X, Check, Highlighter, CheckSquare, Sparkles, Send, Copy, RotateCcw, Sigma } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatPanguSpacing } from '../lib/pangu';
import { useSettings } from '../contexts/SettingsContext';
import CodeBlockComponent from './CodeBlockComponent';
import FrontmatterCard from './FrontmatterCard';
import { parseFrontmatter } from '../lib/frontmatter';
import { useAI } from '../contexts/AIContext';
import { buildPromptMessages } from '../lib/ai/promptBuilder';
import { summarizeContextWithModel } from '../lib/ai/contextCompression';
import { createChatCompletion, normalizeError } from '../lib/ai/openaiClient';
import { isValidApiKey, isValidBaseUrl } from '../lib/ai/validation';
import type { AITemplate } from '../lib/ai/types';
import { matchShortcut } from '../lib/shortcuts';

// Import highlight styles
import 'highlight.js/styles/atom-one-dark.css';

const searchHighlightPluginKey = new PluginKey<DecorationSet>('editor-search-highlights');

function buildSearchRegex(query: string, options: { caseSensitive: boolean; wholeWord: boolean }) {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = options.wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery;
  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

function findSearchMatches(doc: any, query: string, options: { caseSensitive: boolean; wholeWord: boolean }) {
  const regex = buildSearchRegex(query, options);
  const matches: { from: number; to: number }[] = [];
  const MAX_SEARCH_MATCHES = 1000;

  doc.descendants((node: any, pos: number) => {
    if (matches.length >= MAX_SEARCH_MATCHES) {
      return false;
    }
    if (!node.isText || !node.text) {
      return;
    }

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(node.text)) !== null) {
      matches.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
      });
      if (matches.length >= MAX_SEARCH_MATCHES) {
        break;
      }
    }
  });

  return matches;
}

function createSearchDecorations(
  doc: any,
  matches: { from: number; to: number }[],
  activeIndex: number
) {
  const baseStyle =
    'background: rgba(236, 91, 19, 0.22); border-radius: 0.25rem; box-shadow: 0 0 0 1px rgba(236, 91, 19, 0.18);';
  const activeStyle =
    'background: rgba(236, 91, 19, 0.5); box-shadow: 0 0 0 2px rgba(236, 91, 19, 0.45); font-weight: 700;';
  return DecorationSet.create(
    doc,
    matches.map(({ from, to }, index) => {
      const className = index === activeIndex
        ? 'editor-search-highlight editor-search-highlight-active'
        : 'editor-search-highlight';
      return Decoration.inline(from, to, {
        class: className,
        style: index === activeIndex ? activeStyle : baseStyle,
      });
    })
  );
}

// Define the custom AI Suggestion node
const AiSuggestion = TiptapNode.create({
  name: 'aiSuggestion',
  group: 'block',
  content: 'block+',
  parseHTML() { return [{ tag: 'aisuggestion' }]; },
  renderHTML({ HTMLAttributes }) { return ['aisuggestion', mergeAttributes(HTMLAttributes), 0]; },
});

const INLINE_ACTIONS = [
  { id: 'polish', label: '润色', prompt: '请润色以下内容，使其更流畅、自然。' },
  { id: 'rewrite', label: '改写', prompt: '请改写以下内容，保持原意但换一种表达。' },
  { id: 'expand', label: '扩写', prompt: '请在保持主题一致的前提下扩写以下内容。' },
  { id: 'summarize', label: '总结', prompt: '请用要点形式总结以下内容。' },
  { id: 'outline', label: '生成大纲', prompt: '请根据以下内容生成结构化大纲。' },
  { id: 'fix', label: '纠错', prompt: '请检查并修正以下内容的语法与错别字。' },
];

interface EditorProps {
  content: string;
  setContent: (content: string) => void;
  viewMode: 'wysiwyg' | 'source' | 'split';
  setViewMode: (mode: 'wysiwyg' | 'source' | 'split') => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  isToolbarVisible: boolean;
  setIsToolbarVisible: (visible: boolean) => void;
  searchQuery?: string;
  searchVersion?: number;
  searchOptions?: { caseSensitive: boolean; wholeWord: boolean };
  searchNavigation?: { direction: 'next' | 'prev'; token: number } | null;
  searchJump?: { index: number; token: number } | null;
  onSearchMatchCount?: (count: number) => void;
  onSearchActiveMatchIndex?: (index: number) => void;
  onHeadingsChange?: (headings: { level: number; text: string; id: string; pos: number }[]) => void;
  scrollToPos?: { pos: number; timestamp: number } | null;
  editor: any;
  onInsertImage?: () => void | Promise<void>;
  onSaveImageFile?: (file: File) => Promise<string | null>;
  onSelectionChange?: (text: string) => void;
  documentId?: string;
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void;
  onActiveHeadingChange?: (id: string | null) => void;
}

function ToolbarDropdownPortal({
  anchorRef,
  isOpen,
  onClose,
  children,
  className,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const maxLeft = typeof window !== 'undefined' ? Math.max(8, window.innerWidth - 190) : rect.left;
      const left = Math.max(8, Math.min(rect.left, maxLeft));
      setCoords({
        top: rect.bottom + 4,
        left,
      });
    };

    updatePosition();

    const handleScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-toolbar-dropdown="true"]')) {
        return;
      }
      onClose();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen, anchorRef, onClose]);

  if (!isOpen || !coords) return null;

  return createPortal(
    <div
      data-toolbar-dropdown="true"
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 9999,
      }}
      className={className}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

function EditorComponent({ content, setContent, viewMode, setViewMode, isToolbarVisible, setIsToolbarVisible, searchQuery, searchVersion = 0, searchOptions = { caseSensitive: false, wholeWord: false }, searchNavigation, searchJump, onSearchMatchCount, onSearchActiveMatchIndex, onHeadingsChange, scrollToPos, editor, onInsertImage, onSaveImageFile, onSelectionChange, showToast, onActiveHeadingChange }: EditorProps) {
  const { settings, updateSettings } = useSettings();
  const { provider, chatPreferences, memory, updateMemory } = useAI();
  const parsedFrontmatter = useMemo(() => parseFrontmatter(content), [content]);
  const [lineHeight, setLineHeight] = useState(settings.lineHeight);
  const [paragraphSpacing, setParagraphSpacing] = useState(settings.paragraphSpacing ?? 0.5);
  const editorContentClassName = settings.focusMode ? "w-full max-w-none" : "max-w-4xl mx-auto";
  const [showLineHeightMenu, setShowLineHeightMenu] = useState(false);
  const [tablePadding, setTablePadding] = useState(0.6);
  const [showTablePaddingMenu, setShowTablePaddingMenu] = useState(false);
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showMathMenu, setShowMathMenu] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement | null>(null);
  const tableMenuRef = useRef<HTMLDivElement | null>(null);
  const mathMenuRef = useRef<HTMLDivElement | null>(null);
  const lineHeightMenuRef = useRef<HTMLDivElement | null>(null);
  const tablePaddingMenuRef = useRef<HTMLDivElement | null>(null);
  const editorViewportRef = useRef<HTMLDivElement | null>(null);
  const splitPreviewViewportRef = useRef<HTMLDivElement | null>(null);
  const searchPluginKeyRef = useRef<PluginKey | null>(null);
  const searchMatchesRef = useRef<{ from: number; to: number }[]>([]);
  const searchMatchIndexRef = useRef(0);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const [inlineAnchor, setInlineAnchor] = useState<{ top: number; left: number } | null>(null);
  const [cursorAnchor, setCursorAnchor] = useState<{ top: number; left: number } | null>(null);
  const [showCursorActions, setShowCursorActions] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ from: number; to: number; text: string } | null>(null);
  const [inlinePanel, setInlinePanel] = useState<{
    open: boolean;
    actionId: string | null;
    customPrompt: string;
    mode: 'selection' | 'cursor';
    loading: boolean;
    result: string;
    error: string | null;
  }>({
    open: false,
    actionId: null,
    customPrompt: '',
    mode: 'selection',
    loading: false,
    result: '',
    error: null,
  });
  const inlineAbortRef = useRef<AbortController | null>(null);
  const lastScrollRatioRef = useRef<number | null>(null);

  useEffect(() => {
    if (!showHeadingMenu && !showTableMenu && !showLineHeightMenu && !showTablePaddingMenu && !showMathMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inside =
        headingMenuRef.current?.contains(target) ||
        tableMenuRef.current?.contains(target) ||
        mathMenuRef.current?.contains(target) ||
        lineHeightMenuRef.current?.contains(target) ||
        tablePaddingMenuRef.current?.contains(target);
      const insideDropdown = (target as Element | null)?.closest?.('[data-toolbar-dropdown="true"]');

      if (!inside && !insideDropdown) {
        setShowHeadingMenu(false);
        setShowTableMenu(false);
        setShowMathMenu(false);
        setShowLineHeightMenu(false);
        setShowTablePaddingMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHeadingMenu(false);
        setShowTableMenu(false);
        setShowMathMenu(false);
        setShowLineHeightMenu(false);
        setShowTablePaddingMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showHeadingMenu, showTableMenu, showMathMenu, showLineHeightMenu, showTablePaddingMenu]);

  const scrollToPosition = (pos: number) => {
    if (!editor) {
      return false;
    }

    try {
      const coordinates = editor.view.coordsAtPos(pos);
      const activeViewport = viewMode === 'split'
        ? splitPreviewViewportRef.current
        : editorViewportRef.current;

      if (activeViewport) {
        const viewportBounds = activeViewport.getBoundingClientRect();
        const offsetWithinViewport = coordinates.top - viewportBounds.top;
        const targetScrollTop = activeViewport.scrollTop + offsetWithinViewport - activeViewport.clientHeight / 2;

        activeViewport.scrollTo({
          top: Math.max(targetScrollTop, 0),
          behavior: 'smooth',
        });
        return true;
      }
    } catch (error) {
      // Fall through to built-in scroll behavior.
    }

    return false;
  };

  const handleTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    const relativePath = await onSaveImageFile?.(file);
    if (relativePath) {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const altText = file.name ? file.name.replace(/\.[^.]+$/, '') : 'image';
      const markdownImage = `![${altText}](${relativePath})`;
      const updated = content.slice(0, start) + markdownImage + content.slice(end);
      setContent(updated);
    }
  };

  // Sync local line height with settings
  useEffect(() => {
    setLineHeight(settings.lineHeight);
  }, [settings.lineHeight]);

  useEffect(() => {
    setParagraphSpacing(settings.paragraphSpacing ?? 0.5);
  }, [settings.paragraphSpacing]);

  // Scroll-Spy Radar Effect: detects current heading in viewport and updates outline
  useEffect(() => {
    if (!onActiveHeadingChange) return;
    const viewport = viewMode === 'split' ? splitPreviewViewportRef.current : editorViewportRef.current;
    if (!viewport) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const headingElements = viewport.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (!headingElements.length) {
          onActiveHeadingChange?.(null);
          return;
        }

        const viewportTop = viewport.getBoundingClientRect().top;
        let currentActive: string | null = null;

        headingElements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          // If heading is near top of viewport (within 160px from top)
          if (rect.top - viewportTop <= 160) {
            currentActive = el.id || el.textContent || null;
          }
        });

        if (!currentActive && headingElements[0]) {
          currentActive = headingElements[0].id || headingElements[0].textContent || null;
        }

        onActiveHeadingChange?.(currentActive);
      });
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [viewMode, onActiveHeadingChange]);
  useEffect(() => {
    if (!editor || !scrollToPos) {
      return;
    }

    editor.commands.setTextSelection(scrollToPos.pos);

    if (!scrollToPosition(scrollToPos.pos)) {
      editor.commands.scrollIntoView();
    }
  }, [editor, scrollToPos, viewMode]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    let frameId: number | null = null;
    const handleSelectionUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, '\n');
        onSelectionChange?.(text);

        if (text.trim()) {
          setSelectionInfo({ from, to, text });
        } else {
          setSelectionInfo(null);
        }
      });
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, onSelectionChange]);

  const clearSearchHighlights = () => {
    if (!editor) {
      return;
    }

    if (searchPluginKeyRef.current) {
      editor.unregisterPlugin(searchPluginKeyRef.current);
      searchPluginKeyRef.current = null;
    }
    searchMatchesRef.current = [];
    searchMatchIndexRef.current = 0;
    onSearchMatchCount?.(0);
    onSearchActiveMatchIndex?.(0);
  };

  const applySearchSelection = (match: { from: number; to: number }, options: { focus?: boolean } = {}) => {
    if (!editor) {
      return;
    }

    const { from, to } = match;
    const tr = editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, from, to))
      .setMeta(searchHighlightPluginKey, { forceUpdate: true });
    editor.view.dispatch(tr);
    if (!scrollToPosition(from)) {
      editor.commands.scrollIntoView();
    }
    if (options.focus) {
      editor.view.focus();
    }
  };

  // Search Effect
  useEffect(() => {
    if (!editor) return;

    clearSearchHighlights();

    const normalizedQuery = searchQuery?.trim() ?? '';
    if (!normalizedQuery) return;

    const computeMatches = (doc: any) => {
      const matches = findSearchMatches(doc, normalizedQuery, searchOptions);
      searchMatchesRef.current = matches;
      if (searchMatchIndexRef.current >= matches.length) {
        searchMatchIndexRef.current = 0;
      }
      onSearchMatchCount?.(matches.length);
      return matches;
    };

    const matches = computeMatches(editor.state.doc);

    if (matches.length === 0) {
      return;
    }

    const pluginKey = searchHighlightPluginKey;
    const searchPlugin = new Plugin({
      key: pluginKey,
      state: {
        init: (_, state) => createSearchDecorations(state.doc, computeMatches(state.doc), searchMatchIndexRef.current),
        apply: (transaction, decorations, _oldState, newState) => {
          if (transaction.docChanged || transaction.getMeta(pluginKey)?.forceUpdate) {
            return createSearchDecorations(newState.doc, computeMatches(newState.doc), searchMatchIndexRef.current);
          }

          return decorations.map(transaction.mapping, newState.doc);
        },
      },
      props: {
        decorations: (state) => pluginKey.getState(state),
      },
    });

    editor.registerPlugin(searchPlugin);
    searchPluginKeyRef.current = pluginKey;
    searchMatchIndexRef.current = 0;

    const firstMatch = matches[0];
    onSearchActiveMatchIndex?.(1);
    applySearchSelection(firstMatch);

    return () => {
      if (searchPluginKeyRef.current === pluginKey) {
        editor.unregisterPlugin(pluginKey);
        searchPluginKeyRef.current = null;
      }
    };
  }, [editor, searchQuery, searchVersion, searchOptions.caseSensitive, searchOptions.wholeWord]);

  useEffect(() => {
    if (!editor || !searchNavigation) {
      return;
    }

    const matches = searchMatchesRef.current;
    if (matches.length === 0) {
      return;
    }

    const currentPos = editor.state.selection.from;
    let nextIndex = searchMatchIndexRef.current;

    if (searchNavigation.direction === 'next') {
      const forwardIndex = matches.findIndex((match) => match.from > currentPos);
      nextIndex = forwardIndex === -1 ? 0 : forwardIndex;
    } else {
      const reverseIndex = [...matches].reverse().findIndex((match) => match.from < currentPos);
      if (reverseIndex === -1) {
        nextIndex = matches.length - 1;
      } else {
        nextIndex = matches.length - 1 - reverseIndex;
      }
    }

    if (nextIndex === searchMatchIndexRef.current) {
      if (searchNavigation.direction === 'next') {
        nextIndex = (searchMatchIndexRef.current + 1) % matches.length;
      } else {
        nextIndex = (searchMatchIndexRef.current - 1 + matches.length) % matches.length;
      }
    }

    searchMatchIndexRef.current = nextIndex;
    const target = matches[nextIndex];
    onSearchActiveMatchIndex?.(nextIndex + 1);
    applySearchSelection(target);
  }, [editor, searchNavigation]);

  useEffect(() => {
    if (!editor || !searchJump) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const matches = searchMatchesRef.current;
      if (matches.length === 0) {
        return;
      }

      const clampedIndex = Math.min(Math.max(searchJump.index, 0), matches.length - 1);
      searchMatchIndexRef.current = clampedIndex;
      onSearchActiveMatchIndex?.(clampedIndex + 1);
      applySearchSelection(matches[clampedIndex], { focus: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [editor, searchJump]);

  const handleBold = () => editor.chain().focus().toggleBold().run();
  const handleItalic = () => editor.chain().focus().toggleItalic().run();
  const handleList = () => editor.chain().focus().toggleBulletList().run();
  const handleLink = () => {
    const url = window.prompt('URL');
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };
  const handleImage = () => {
    void onInsertImage?.();
  };
  const handleCode = () => editor.chain().focus().toggleCodeBlock().run();
  const handleInlineCode = () => editor.chain().focus().toggleCode().run();
  const handleHighlight = () => editor.chain().focus().toggleHighlight().run();
  const handleTaskList = () => editor.chain().focus().toggleTaskList().run();
  const handleHeading1 = () => editor.chain().focus().toggleHeading({ level: 1 }).run();
  const handleHeading2 = () => editor.chain().focus().toggleHeading({ level: 2 }).run();
  const handleQuote = () => editor.chain().focus().toggleBlockquote().run();
  const handleInsertMathInline = () => {
    editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: 'x' } }).run();
  };
  const handleInsertMathBlock = () => {
    editor.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run();
  };
  const handleTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const handleAddRowBefore = () => editor.chain().focus().addRowBefore().run();
  const handleAddRowAfter = () => editor.chain().focus().addRowAfter().run();
  const handleAddColumnBefore = () => editor.chain().focus().addColumnBefore().run();
  const handleAddColumnAfter = () => editor.chain().focus().addColumnAfter().run();
  const handleDeleteRow = () => editor.chain().focus().deleteRow().run();
  const handleDeleteColumn = () => editor.chain().focus().deleteColumn().run();
  const handleDeleteTable = () => editor.chain().focus().deleteTable().run();
  const handleAutoFitColumns = () => {
    if (!editor.isActive('table')) return;
    const { state, dispatch } = editor.view;
    let tr = state.tr;
    const { $from } = state.selection;
    let tablePos: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }
    if (tablePos !== null) {
      const tableNode = state.doc.nodeAt(tablePos);
      if (tableNode) {
        tableNode.descendants((node: any, pos: number) => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            if (node.attrs.colwidth) {
              tr = tr.setNodeMarkup(tablePos! + 1 + pos, null, { ...node.attrs, colwidth: null });
            }
          }
        });
        if (tableNode.attrs.style) {
          tr = tr.setNodeMarkup(tablePos, null, { ...tableNode.attrs, style: null });
        }
        dispatch(tr);
        showToast?.('已恢复智能内容自适应列宽', 'info');
      }
    }
  };
  const handleAlignColumn = (align: 'left' | 'center' | 'right') => {
    if (!editor.isActive('table')) return;
    const { state, dispatch } = editor.view;
    let tr = state.tr;
    const { $from } = state.selection;
    let tablePos: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }
    if (tablePos !== null) {
      const tableNode = state.doc.nodeAt(tablePos);
      if (tableNode) {
        const map = TableMap.get(tableNode);
        const rect = map.findCell($from.pos - tablePos - 1);
        const targetCol = rect.left;
        
        for (let row = 0; row < map.height; row++) {
          const cellPos = map.map[targetCol + row * map.width];
          const node = tableNode.nodeAt(cellPos);
          if (node) {
            tr = tr.setNodeMarkup(tablePos + 1 + cellPos, null, {
              ...node.attrs,
              style: `text-align: ${align};`,
            });
          }
        }
        dispatch(tr);
        showToast?.(`当前列已设为${align === 'left' ? '居左' : align === 'center' ? '居中' : '靠右'}对齐`, 'info');
      }
    }
  };

  const handleEqualColumns = () => {
    if (!editor.isActive('table')) return;
    const { state, dispatch } = editor.view;
    let tr = state.tr;
    const { $from } = state.selection;
    let tablePos: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }
    if (tablePos !== null) {
      const tableNode = state.doc.nodeAt(tablePos);
      if (tableNode && tableNode.firstChild) {
        const colCount = tableNode.firstChild.childCount;
        const viewportWidth = editorViewportRef.current?.clientWidth || 800;
        const availableWidth = Math.max(400, Math.min(viewportWidth - 120, 800));
        const equalWidth = Math.floor(availableWidth / Math.max(1, colCount));
        tableNode.descendants((node: any, pos: number) => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            tr = tr.setNodeMarkup(tablePos! + 1 + pos, null, { ...node.attrs, colwidth: [equalWidth] });
          }
        });
        dispatch(tr);
        showToast?.('已均等分配各列列宽', 'info');
      }
    }
  };
  const handleToggleHeaderRow = () => editor.chain().focus().toggleHeaderRow().run();
  const handleToggleHeaderColumn = () => editor.chain().focus().toggleHeaderColumn().run();
  const handleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  const handleStrikethrough = () => editor.chain().focus().toggleStrike().run();
  const handleHorizontalRule = () => editor.chain().focus().setHorizontalRule().run();
  const handleSmartFormat = () => {
    // Note: AiSuggestion was removed from extensions in App.tsx to simplify, 
    // but if needed it can be added back. For now, let's just insert content.
    editor.chain().focus().insertContent('<p>已为您自动优化排版格式。</p>').run();
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--table-row-padding', `${tablePadding}rem`);
  }, [tablePadding]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const shortcuts = settings.shortcuts;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K') && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        openInlinePrompt();
        return;
      }

      if (event.key === 'Tab') {
        if (editor.isActive('table')) {
          event.preventDefault();
          if (event.shiftKey) {
            editor.chain().focus().goToPreviousCell().run();
          } else {
            const moved = editor.chain().focus().goToNextCell().run();
            if (!moved) {
              editor.chain().focus().addRowAfter().goToNextCell().run();
            }
          }
          return;
        } else {
          event.preventDefault();
          editor.chain().focus().insertContent('  ').run();
          return;
        }
      }

      // Typora compatibility: Ctrl+Enter inside table inserts a new row below
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && editor.isActive('table')) {
        event.preventDefault();
        editor.chain().focus().addRowAfter().goToNextCell().run();
        return;
      }

      // Typora compatibility: Ctrl+\ clears all formatting
      if ((event.ctrlKey || event.metaKey) && (event.key === '\\' || event.code === 'Backslash') && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        editor.chain().focus().unsetAllMarks().clearNodes().run();
        showToast?.('已清除格式', 'info');
        return;
      }

      // Typora compatibility: Ctrl+Shift+H toggles highlight
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'h' || event.key === 'H') && !event.altKey) {
        event.preventDefault();
        handleHighlight();
        return;
      }

      // Typora formula shortcuts
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'm' || event.key === 'M') && !event.altKey) {
        event.preventDefault();
        handleInsertMathBlock();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'm' || event.key === 'M') && !event.altKey) {
        event.preventDefault();
        handleInsertMathInline();
        return;
      }

      if (matchShortcut(event, shortcuts.bold)) return run(handleBold);
      if (matchShortcut(event, shortcuts.italic)) return run(handleItalic);
      if (matchShortcut(event, shortcuts.strike)) return run(handleStrikethrough);
      if (matchShortcut(event, shortcuts.inlineCode)) return run(handleInlineCode);
      if (matchShortcut(event, shortcuts.codeBlock)) return run(handleCode);
      if (matchShortcut(event, shortcuts.blockquote)) return run(handleQuote);
      if (matchShortcut(event, shortcuts.orderedList)) return run(handleOrderedList);
      if (matchShortcut(event, shortcuts.unorderedList)) return run(handleList);
      if (matchShortcut(event, shortcuts.heading1)) return run(() => editor.chain().focus().toggleHeading({ level: 1 }).run());
      if (matchShortcut(event, shortcuts.heading2)) return run(() => editor.chain().focus().toggleHeading({ level: 2 }).run());
      if (matchShortcut(event, shortcuts.heading3)) return run(() => editor.chain().focus().toggleHeading({ level: 3 }).run());
      if (matchShortcut(event, shortcuts.heading4)) return run(() => editor.chain().focus().toggleHeading({ level: 4 }).run());
      if (matchShortcut(event, shortcuts.heading5)) return run(() => editor.chain().focus().toggleHeading({ level: 5 }).run());
      if (matchShortcut(event, shortcuts.heading6)) return run(() => editor.chain().focus().toggleHeading({ level: 6 }).run());
      if (matchShortcut(event, shortcuts.paragraph)) return run(() => editor.chain().focus().setParagraph().run());
      if (matchShortcut(event, shortcuts.table)) return run(handleTable);
      if (matchShortcut(event, shortcuts.link)) return run(handleLink);
      if (matchShortcut(event, shortcuts.image)) return run(handleImage);
    };

    const dom = editor.view.dom;
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [editor, settings.shortcuts, onInsertImage]);

  // Typewriter mode: ONLY center viewport during actual keyboard typing or explicit command, NEVER on pure mouse clicks
  useEffect(() => {
    if (!settings.typewriterMode || !editor) {
      return;
    }

    let isTyping = false;
    const handleKeyDown = () => {
      isTyping = true;
    };
    const handleMouseDown = () => {
      isTyping = false; // Mouse click must never trigger typewriter jump
    };

    const handleSelectionUpdate = () => {
      if (!isTyping) {
        return;
      }
      isTyping = false;

      const viewport = editorViewportRef.current;
      if (!viewport) {
        return;
      }

      try {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const viewportRect = viewport.getBoundingClientRect();
        const cursorY = coords.top - viewportRect.top;
        const targetY = viewportRect.height * 0.45;
        const diff = cursorY - targetY;
        if (Math.abs(diff) > 28) {
          viewport.scrollBy({ top: diff, behavior: 'smooth' });
        }
      } catch {}
    };

    const dom = editor.view.dom;
    dom.addEventListener('keydown', handleKeyDown);
    dom.addEventListener('mousedown', handleMouseDown);
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      dom.removeEventListener('keydown', handleKeyDown);
      dom.removeEventListener('mousedown', handleMouseDown);
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, settings.typewriterMode]);

  if (!editor) return null;

  const inlineConfigReady =
    isValidBaseUrl(provider.baseUrl) && isValidApiKey(provider.apiKey) && provider.defaultModel.trim().length > 0;

  const buildDiffLines = (original: string, updated: string) => {
    const originalLines = original.split('\n');
    const updatedLines = updated.split('\n');
    const max = Math.max(originalLines.length, updatedLines.length);
    const lines: { type: 'same' | 'added' | 'removed'; text: string }[] = [];

    for (let i = 0; i < max; i += 1) {
      const orig = originalLines[i];
      const next = updatedLines[i];
      if (orig === next) {
        if (orig !== undefined) lines.push({ type: 'same', text: orig });
      } else {
        if (orig !== undefined) lines.push({ type: 'removed', text: orig });
        if (next !== undefined) lines.push({ type: 'added', text: next });
      }
    }

    return lines;
  };

  const runInlineAction = async (actionId: string, mode: 'selection' | 'cursor', customPromptInput?: string) => {
    const action = INLINE_ACTIONS.find((item) => item.id === actionId);
    if (!action && !customPromptInput) {
      return;
    }
    if (!inlineConfigReady) {
      setInlinePanel((prev) => ({
        ...prev,
        open: true,
        actionId,
        loading: false,
        result: '',
        error: '请先在【设置 -> AI 能力中心】完成 API 配置',
      }));
      return;
    }

    const promptText = customPromptInput || action?.prompt || '请协助润色以下内容：';

    inlineAbortRef.current?.abort();
    const controller = new AbortController();
    inlineAbortRef.current = controller;
    setInlinePanel((prev) => ({
      ...prev,
      open: true,
      actionId,
      customPrompt: customPromptInput !== undefined ? customPromptInput : prev.customPrompt,
      mode,
      loading: true,
      result: '',
      error: null,
    }));

    try {
      const selectionText = selectionInfo?.text ?? '';
      const scope = selectionText.trim() ? 'selection' : 'document';
      const memoryInput = chatPreferences.useMemory ? memory : { ...memory, enabled: false };
      const modelContextWindow =
        provider.modelContextWindows?.[provider.defaultModel] ?? chatPreferences.contextWindowTokens;
      const { messages: requestMessages, summaryUpdate } = await buildPromptMessages({
        memory: memoryInput,
        template: {
          id: actionId,
          name: action?.label || '就地指令',
          prompt: promptText,
          scope,
        } as unknown as AITemplate,
        contextScope: scope,
        documentText: content,
        selectionText,
        userInput: customPromptInput || '',
        contextBudget: {
          autoSummarize: chatPreferences.autoSummarize,
          maxTokens: modelContextWindow,
          warnRatio: chatPreferences.contextWarnRatio,
          summarizeDocument: true,
        },
        summarize: (text) =>
          summarizeContextWithModel({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: provider.defaultModel,
            text,
            signal: controller.signal,
          }),
      });
      if (summaryUpdate && memoryInput.enabled) {
        updateMemory({ summary: summaryUpdate });
      }

      const result = await createChatCompletion({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.defaultModel,
        messages: requestMessages,
        stream: false,
        signal: controller.signal,
      });
      setInlinePanel((prev) => ({ ...prev, loading: false, result: result.content || '未生成内容' }));
    } catch (err) {
      const normalized = normalizeError(err);
      setInlinePanel((prev) => ({ ...prev, loading: false, error: normalized.message }));
    }
  };

  const cancelInlineAction = () => {
    inlineAbortRef.current?.abort();
    setInlinePanel((prev) => ({ ...prev, loading: false, error: prev.error ?? '已停止生成' }));
  };

  const applyInlineResult = (mode: 'replace' | 'insert' | 'append') => {
    if (!inlinePanel.result) return;
    const text = inlinePanel.result;
    const selection = selectionInfo ?? { from: editor.state.selection.from, to: editor.state.selection.to, text: '' };
    if (mode === 'replace') {
      editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, text).run();
    } else if (mode === 'insert') {
      editor.chain().focus().insertContentAt(selection.to, `\n${text}`).run();
    } else {
      const endPos = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(endPos, `\n\n${text}`).run();
    }
    setInlinePanel((prev) => ({ ...prev, open: false }));
  };
  const openCursorActions = () => {
    openInlinePrompt();
  };

  const openInlinePrompt = (defaultActionId?: string) => {
    const viewport = editorViewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const { from, to } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    const top = Math.max(coords.top - viewport.top + 28, 12);
    const left = Math.min(Math.max(coords.left - viewport.left, 12), Math.max(12, viewport.width - 480));
    setInlineAnchor({ top, left });
    setShowCursorActions(false);
    setInlinePanel({
      open: true,
      actionId: defaultActionId || null,
      customPrompt: '',
      mode: from !== to ? 'selection' : 'cursor',
      loading: false,
      result: '',
      error: null,
    });
  };
  const languages = ['javascript', 'typescript', 'html', 'css', 'json', 'bash', 'python', 'go', 'cpp', 'powershell'];
  const currentLanguage = editor.getAttributes('codeBlock').language || 'auto';

  const handleLanguageChange = (lang: string) => {
    editor.chain().focus().updateAttributes('codeBlock', { language: lang }).run();
  };
  const panelAnchor = inlineAnchor ?? cursorAnchor;
  const diffLines = inlinePanel.result ? buildDiffLines(selectionInfo?.text ?? '', inlinePanel.result) : [];

  return (
    <main className="flex-1 min-w-0 flex flex-col bg-white dark:bg-[#121212] relative transition-colors duration-200 overflow-hidden">
      {/* Editor Toolbar */}
      {isToolbarVisible && (
        <div className="editor-toolbar print-hide flex items-center justify-between w-full max-w-full px-3 md:px-6 py-2 border-b border-slate-100 dark:border-[#27272A] bg-white/80 dark:bg-[#121212]/80 backdrop-blur-sm z-30 sticky top-0 transition-colors duration-200 gap-2">
          <div
            className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar py-0.5"
            onWheel={(e) => {
              if (e.deltaY !== 0 && e.deltaX === 0) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
          <button onClick={handleBold} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('bold') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="加粗 (Ctrl+B)"><Bold size={16} /></button>
          <button onClick={handleItalic} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('italic') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="斜体 (Ctrl+I)"><Italic size={16} /></button>
          <button onClick={handleStrikethrough} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('strike') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="删除线"><Strikethrough size={16} /></button>
          <button onClick={handleHighlight} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('highlight') ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="文本高亮 (==text==)"><Highlighter size={16} /></button>
          <button onClick={handleInlineCode} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('code') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="行内代码 (`code`)"><Code size={16} /></button>
          
          <div className="relative ml-1 shrink-0" ref={headingMenuRef}>
            <button 
              onClick={() => {
                setShowHeadingMenu(!showHeadingMenu);
                setShowTableMenu(false);
                setShowMathMenu(false);
                setShowLineHeightMenu(false);
                setShowTablePaddingMenu(false);
              }}
              className="flex items-center gap-1 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors"
              title="标题"
            >
              <HeadingIcon size={16} />
              <ChevronDown size={12} />
            </button>
            <ToolbarDropdownPortal
              anchorRef={headingMenuRef}
              isOpen={showHeadingMenu}
              onClose={() => setShowHeadingMenu(false)}
              className="p-2 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md shadow-lg w-32"
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <button
                  key={level}
                  onClick={() => { 
                    editor.chain().focus().toggleHeading({ level: level as any }).run();
                    setShowHeadingMenu(false); 
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A]",
                    editor.isActive('heading', { level }) ? "text-accent font-bold" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  Heading {level}
                </button>
              ))}
              <button
                onClick={() => { 
                  editor.chain().focus().setParagraph().run();
                  setShowHeadingMenu(false); 
                }}
                className={cn(
                  "w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] border-t border-slate-100 dark:border-[#27272A] mt-1 pt-1",
                  editor.isActive('paragraph') ? "text-accent font-bold" : "text-slate-600 dark:text-slate-400"
                )}
              >
                Paragraph
              </button>
            </ToolbarDropdownPortal>
          </div>

          <div className="w-px h-4 bg-slate-200 dark:bg-[#27272A] mx-1 transition-colors duration-200 shrink-0"></div>

          <button onClick={handleList} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('bulletList') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="无序列表"><List size={16} /></button>
          <button onClick={handleOrderedList} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('orderedList') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="有序列表"><ListOrdered size={16} /></button>
          <button onClick={handleTaskList} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('taskList') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="待办任务清单"><CheckSquare size={16} /></button>
          <button onClick={handleQuote} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('blockquote') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="引用"><Quote size={16} /></button>
          <button onClick={handleCode} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('codeBlock') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="代码块"><Code2 size={16} /></button>
          
          <div className="relative shrink-0" ref={mathMenuRef}>
            <button
              onClick={() => {
                setShowMathMenu(!showMathMenu);
                setShowTableMenu(false);
                setShowHeadingMenu(false);
                setShowLineHeightMenu(false);
                setShowTablePaddingMenu(false);
              }}
              className={cn(
                "flex items-center gap-0.5 p-1.5 rounded transition-colors",
                editor.isActive('mathBlock') || editor.isActive('mathInline')
                  ? "bg-accent-soft text-accent"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]"
              )}
              title="数学公式 (Ctrl+Shift+M / Ctrl+M)"
            >
              <Sigma size={16} />
              <ChevronDown size={10} />
            </button>
            <ToolbarDropdownPortal
              anchorRef={mathMenuRef}
              isOpen={showMathMenu}
              onClose={() => setShowMathMenu(false)}
              className="p-1.5 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg shadow-xl w-44"
            >
              <button
                onClick={() => {
                  handleInsertMathInline();
                  setShowMathMenu(false);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] flex items-center justify-between text-slate-700 dark:text-slate-200"
              >
                <span>行内公式 ($...$)</span>
                <span className="text-[10px] text-slate-400">Ctrl+M</span>
              </button>
              <button
                onClick={() => {
                  handleInsertMathBlock();
                  setShowMathMenu(false);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] flex items-center justify-between text-slate-700 dark:text-slate-200"
              >
                <span>公式块 ($$...$$)</span>
                <span className="text-[10px] text-slate-400">Ctrl+Shift+M</span>
              </button>
            </ToolbarDropdownPortal>
          </div>

          <button onClick={handleHorizontalRule} className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors shrink-0" title="分割线"><Minus size={16} /></button>
          <div className="relative shrink-0" ref={tableMenuRef}>
            <button
              onClick={() => {
                setShowTableMenu(!showTableMenu);
                setShowHeadingMenu(false);
                setShowMathMenu(false);
                setShowLineHeightMenu(false);
                setShowTablePaddingMenu(false);
              }}
              className="flex items-center gap-1 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors"
              title="表格"
            >
              <TableIcon size={16} />
              <ChevronDown size={12} />
            </button>
            <ToolbarDropdownPortal
              anchorRef={tableMenuRef}
              isOpen={showTableMenu}
              onClose={() => setShowTableMenu(false)}
              className="p-2 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md shadow-lg w-44"
            >
              <button
                onClick={() => { handleTable(); setShowTableMenu(false); }}
                className="w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200"
              >
                插入表格 3×3
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-[#27272A]" />
              {[
                { label: '上方插入行', action: handleAddRowBefore },
                { label: '下方插入行', action: handleAddRowAfter },
                { label: '左侧插入列', action: handleAddColumnBefore },
                { label: '右侧插入列', action: handleAddColumnAfter },
              ].map((item) => {
                const enabled = editor.isActive('table');
                return (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setShowTableMenu(false); }}
                    className={cn(
                      "w-full text-left px-2 py-1 text-xs rounded",
                      enabled
                        ? "hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200"
                        : "text-slate-400 cursor-not-allowed"
                    )}
                    disabled={!enabled}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="my-1 border-t border-slate-100 dark:border-[#27272A]" />
              {[
                { label: '删除当前行', action: handleDeleteRow },
                { label: '删除当前列', action: handleDeleteColumn },
                { label: '删除表格', action: handleDeleteTable },
              ].map((item) => {
                const enabled = editor.isActive('table');
                return (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setShowTableMenu(false); }}
                    className={cn(
                      "w-full text-left px-2 py-1 text-xs rounded",
                      enabled
                        ? "hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200"
                        : "text-slate-400 cursor-not-allowed"
                    )}
                    disabled={!enabled}
                  >
                    {item.label}
                  </button>
                );
              })}
              <div className="my-1 border-t border-slate-100 dark:border-[#27272A]" />
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">当前列对齐</div>
              <div className="flex items-center gap-1 px-1 mb-1">
                <button
                  type="button"
                  onClick={() => { handleAlignColumn('left'); setShowTableMenu(false); }}
                  className="flex-1 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-center"
                  title="当前列左对齐"
                >
                  居左
                </button>
                <button
                  type="button"
                  onClick={() => { handleAlignColumn('center'); setShowTableMenu(false); }}
                  className="flex-1 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-center"
                  title="当前列居中对齐"
                >
                  居中
                </button>
                <button
                  type="button"
                  onClick={() => { handleAlignColumn('right'); setShowTableMenu(false); }}
                  className="flex-1 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200 text-center"
                  title="当前列右对齐"
                >
                  靠右
                </button>
              </div>
              <div className="my-1 border-t border-slate-100 dark:border-[#27272A]" />
              {[
                { label: '自适应内容列宽 (推荐)', action: handleAutoFitColumns },
                { label: '均等分配各列列宽', action: handleEqualColumns },
                { label: '切换表头行', action: handleToggleHeaderRow },
                { label: '切换表头列', action: handleToggleHeaderColumn },
              ].map((item) => {
                const enabled = editor.isActive('table');
                return (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setShowTableMenu(false); }}
                    className={cn(
                      "w-full text-left px-2 py-1 text-xs rounded",
                      enabled
                        ? "hover:bg-slate-100 dark:hover:bg-[#27272A] text-slate-700 dark:text-slate-200"
                        : "text-slate-400 cursor-not-allowed"
                    )}
                    disabled={!enabled}
                  >
                    {item.label}
                  </button>
                );
              })}
            </ToolbarDropdownPortal>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-[#27272A] mx-1 transition-colors duration-200 shrink-0"></div>
          <button onClick={handleLink} className={cn("p-1.5 rounded transition-colors shrink-0", editor.isActive('link') ? "bg-accent-soft text-accent" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A]")} title="超链接"><Link size={16} /></button>
          <button onClick={handleImage} className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors shrink-0" title="插入图片"><ImageIcon size={16} /></button>
          
          <div className="relative ml-2 shrink-0" ref={lineHeightMenuRef}>
            <button 
              onClick={() => {
                setShowLineHeightMenu(!showLineHeightMenu);
                setShowHeadingMenu(false);
                setShowTableMenu(false);
                setShowMathMenu(false);
                setShowTablePaddingMenu(false);
              }}
              className="flex items-center gap-1 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors"
              title="排版间距 (行间距与段落间隙)"
            >
              <SlidersHorizontal size={16} />
              <ChevronDown size={12} />
            </button>
            <ToolbarDropdownPortal
              anchorRef={lineHeightMenuRef}
              isOpen={showLineHeightMenu}
              onClose={() => setShowLineHeightMenu(false)}
              className="p-1.5 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md shadow-lg w-44"
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100 dark:border-[#27272A] mb-1">
                文本行间距 (Line Height)
              </div>
              {[
                { label: '1.5 (紧凑速记)', val: 1.5 },
                { label: '1.75 (舒适标准)', val: 1.75 },
                { label: '2.0 (双倍透气)', val: 2.0 },
                { label: '2.2 (超宽留白)', val: 2.2 },
              ].map(({ label, val }) => (
                <button
                  key={val}
                  onClick={() => { 
                    setLineHeight(val);
                    updateSettings({ lineHeight: val });
                    document.documentElement.style.setProperty('--editor-line-height', `${val}`);
                    setShowLineHeightMenu(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] flex items-center justify-between transition-colors",
                    lineHeight === val ? "text-accent font-bold bg-accent-soft" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <span>{label}</span>
                  {lineHeight === val && <Check size={12} className="text-accent" />}
                </button>
              ))}

              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-slate-400 border-t border-slate-100 dark:border-[#27272A] mt-1 mb-1">
                段落间距 (Paragraph Spacing)
              </div>
              {[
                { label: '紧凑贴合 (4px)', val: 0.25 },
                { label: '适中标准 (8px)', val: 0.5 },
                { label: '宽松舒适 (14px)', val: 0.8 },
                { label: '大段留白 (20px)', val: 1.2 },
              ].map(({ label, val }) => (
                <button
                  key={val}
                  onClick={() => { 
                    setParagraphSpacing(val);
                    updateSettings({ paragraphSpacing: val });
                    document.documentElement.style.setProperty('--editor-paragraph-spacing', `${val}em`);
                    setShowLineHeightMenu(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] flex items-center justify-between transition-colors",
                    paragraphSpacing === val ? "text-accent font-bold bg-accent-soft" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <span>{label}</span>
                  {paragraphSpacing === val && <Check size={12} className="text-accent" />}
                </button>
              ))}
            </ToolbarDropdownPortal>
          </div>

          <div className="relative ml-1 shrink-0" ref={tablePaddingMenuRef}>
            <button 
              onClick={() => {
                setShowTablePaddingMenu(!showTablePaddingMenu);
                setShowHeadingMenu(false);
                setShowTableMenu(false);
                setShowMathMenu(false);
                setShowLineHeightMenu(false);
              }}
              className="flex items-center gap-1 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272A] rounded transition-colors"
              title="表格行高与内边距 (紧凑/适中/宽松/超宽)"
            >
              <Rows size={16} />
              <ChevronDown size={12} />
            </button>
            <ToolbarDropdownPortal
              anchorRef={tablePaddingMenuRef}
              isOpen={showTablePaddingMenu}
              onClose={() => setShowTablePaddingMenu(false)}
              className="p-1.5 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md shadow-lg w-36"
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100 dark:border-[#27272A] mb-1">表格行距与内边距</div>
              {[
                { label: '超紧凑 (2px)', value: 0.15 },
                { label: '紧凑常用 (5px)', value: 0.32 },
                { label: '舒适适中 (8px)', value: 0.55 },
                { label: '宽敞松散 (15px)', value: 0.95 }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => { setTablePadding(option.value); setShowTablePaddingMenu(false); }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-[#27272A] flex items-center justify-between transition-colors",
                    tablePadding === option.value ? "text-accent font-bold bg-accent-soft" : "text-slate-600 dark:text-slate-400"
                  )}
                >
                  <span>{option.label}</span>
                  {tablePadding === option.value && <Check size={12} className="text-accent" />}
                </button>
              ))}
            </ToolbarDropdownPortal>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-[#27272A] mx-2 transition-colors duration-200 shrink-0"></div>
        </div>
          <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-[#121212] pl-2 z-10 border-l border-slate-100 dark:border-[#27272A]/50">
            <div className="flex items-center bg-slate-100 dark:bg-[#18181B] p-0.5 rounded-lg border border-transparent dark:border-[#27272A] mr-1">
              <button
                onClick={() => setViewMode('wysiwyg')}
                aria-label="所见即所得"
                className={cn(
                  "p-1 rounded transition-all",
                  viewMode === 'wysiwyg'
                    ? "bg-white dark:bg-[#27272A] text-accent shadow-sm"
                    : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
                title="所见即所得"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => setViewMode('source')}
                aria-label="源码模式"
                className={cn(
                  "p-1 rounded transition-all",
                  viewMode === 'source'
                    ? "bg-white dark:bg-[#27272A] text-accent shadow-sm"
                    : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
                title="源码模式"
              >
                <Code size={14} />
              </button>
              <button
                onClick={() => setViewMode('split')}
                aria-label="分屏预览"
                className={cn(
                  "p-1 rounded transition-all",
                  viewMode === 'split'
                    ? "bg-white dark:bg-[#27272A] text-accent shadow-sm"
                    : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
                title="分屏预览"
              >
                <Columns size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ focusMode: !settings.focusMode })}
              aria-label={settings.focusMode ? '退出专注模式' : '进入专注模式'}
              title={`${settings.focusMode ? '退出专注模式' : '进入专注模式'} (Ctrl+Shift+F)`}
              className={cn(
                "p-1.5 rounded transition-colors",
                settings.focusMode
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-[#27272A]"
                  : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Focus size={16} />
            </button>
            <button 
              onClick={() => setIsToolbarVisible(false)} 
              className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded transition-colors"
              aria-label="隐藏编辑工具栏"
              title="隐藏编辑工具栏 (Ctrl+Shift+T)"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      )}
      {!isToolbarVisible && (
        <button
          type="button"
          onClick={() => setIsToolbarVisible(true)}
          aria-label="显示编辑工具栏"
          title="显示编辑工具栏 (Ctrl+Shift+T)"
          className="print-hide absolute right-4 top-3 z-20 flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:border-accent hover:text-accent dark:border-[#27272A] dark:bg-[#18181B]/90 dark:text-slate-300"
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Editor Area */}
      <div
        ref={editorViewportRef}
        data-testid="editor-main-viewport"
        className={cn(
          "printable-content flex-1 relative overflow-y-auto custom-scrollbar p-8 md:px-16 lg:px-24"
        )}
        style={{
          '--editor-line-height': `${lineHeight}`, 
          '--editor-paragraph-spacing': `${paragraphSpacing}em`,
          '--table-row-padding': `${tablePadding}rem`,
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily === 'Inter' ? 'Inter, sans-serif' : settings.fontFamily === 'JetBrains Mono' ? 'JetBrains Mono, monospace' : 'Georgia, serif'
        } as React.CSSProperties}
      >
        {/* Inline AI Assistant (Ctrl+K) */}
        {inlinePanel.open && inlineAnchor && (
          <div
            className="print-hide absolute z-40 w-[450px] bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-4 transition-all"
            style={{ top: inlineAnchor.top + 36, left: inlineAnchor.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5 text-accent font-bold text-xs">
                <Sparkles size={14} className="fill-current" />
                <span>行内 AI 助手 (Ctrl+K)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (inlinePanel.loading) cancelInlineAction();
                  setInlinePanel((prev) => ({ ...prev, open: false }));
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md transition-colors"
                title="关闭 (Esc)"
              >
                <X size={14} />
              </button>
            </div>

            {/* Custom Prompt Input */}
            <div className="relative mb-2.5">
              <input
                type="text"
                autoFocus
                value={inlinePanel.customPrompt}
                onChange={(e) => setInlinePanel((prev) => ({ ...prev, customPrompt: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!inlinePanel.loading) {
                      if (!inlinePanel.result) {
                        void runInlineAction('custom', inlinePanel.mode, inlinePanel.customPrompt);
                      } else {
                        applyInlineResult('replace');
                      }
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    if (inlinePanel.loading) cancelInlineAction();
                    setInlinePanel((prev) => ({ ...prev, open: false }));
                  }
                }}
                placeholder={inlinePanel.result ? "输入修改意见重新生成，或按 Enter 替换选区" : "输入就地修改指令（如：润色、扩写、转为表格、翻译）..."}
                disabled={inlinePanel.loading}
                className="w-full bg-slate-50 dark:bg-[#0E0E11] border border-slate-200 dark:border-[#27272A] rounded-xl text-xs py-2.5 pl-3 pr-9 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-1 ring-accent"
              />
              <button
                type="button"
                onClick={() => {
                  if (inlinePanel.loading) cancelInlineAction();
                  else void runInlineAction('custom', inlinePanel.mode, inlinePanel.customPrompt);
                }}
                disabled={!inlinePanel.customPrompt.trim() && !inlinePanel.loading}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors text-white",
                  inlinePanel.loading ? "bg-amber-500 hover:bg-amber-600" : "bg-accent hover:bg-accent-strong",
                  !inlinePanel.customPrompt.trim() && !inlinePanel.loading && "opacity-40 cursor-not-allowed"
                )}
                title={inlinePanel.loading ? '停止生成' : '发送指令'}
              >
                {inlinePanel.loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>

            {/* Quick Prompt Chips */}
            {!inlinePanel.loading && !inlinePanel.result && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { label: '✨ 润色文采', prompt: '请对以下内容进行润色，提升文采和流畅度：' },
                  { label: '📝 提炼要点', prompt: '请提炼要点，列出核心结论：' },
                  { label: '🌐 翻译为英文', prompt: '请将以下内容翻译为纯正地道的英文 Markdown：' },
                  { label: '📋 转为表格', prompt: '请将以下内容整理提取为规整的 Markdown 表格：' },
                  { label: '🔍 纠正错别字', prompt: '请检查并纠正以下内容中的错别字与语法语病：' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setInlinePanel((prev) => ({ ...prev, customPrompt: chip.prompt }));
                      void runInlineAction('custom', inlinePanel.mode, chip.prompt);
                    }}
                    className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading state */}
            {inlinePanel.loading && (
              <div className="p-3 my-2 rounded-xl bg-accent-soft text-accent text-xs font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>AI 正在全力生成中...</span>
                </div>
                <button
                  type="button"
                  onClick={cancelInlineAction}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                >
                  取消
                </button>
              </div>
            )}

            {/* Error display */}
            {inlinePanel.error && (
              <div className="p-2.5 my-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-xs">
                {inlinePanel.error}
              </div>
            )}

            {/* Result Preview / Diff */}
            {!inlinePanel.loading && inlinePanel.result && (
              <div className="my-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#0E0E11] p-3 max-h-48 overflow-y-auto custom-scrollbar text-xs leading-relaxed">
                <div className="prose-ai max-w-none text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                  {inlinePanel.result}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!inlinePanel.loading && inlinePanel.result && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyInlineResult('replace')}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-strong transition-colors flex items-center gap-1 shadow-xs"
                    title="替换原有内容 (Enter)"
                  >
                    <Check size={13} />
                    <span>替换选区 (Enter)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyInlineResult('insert')}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A] transition-colors"
                  >
                    插入下方
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(inlinePanel.result);
                      showToast?.('已复制到剪贴板', 'info');
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title="复制结果"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void runInlineAction(inlinePanel.actionId || 'custom', inlinePanel.mode, inlinePanel.customPrompt)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title="重新生成"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {parsedFrontmatter.frontmatter && (
          <FrontmatterCard
            data={parsedFrontmatter.frontmatter}
            onEditInSource={() => setViewMode('source')}
          />
        )}
        {viewMode === 'source' ? (
          <textarea
            aria-label="Markdown 源码"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handleTextareaPaste}
            className="w-full h-full min-h-[500px] bg-transparent border-none resize-none focus:ring-0 font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 outline-none"
          />
        ) : viewMode === 'split' ? (
          <div className="grid h-full min-h-[500px] gap-6 lg:grid-cols-2">
            <section className="flex h-full min-h-[500px] flex-col rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-[#27272A] dark:bg-[#18181B]/80">
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Markdown 源码</div>
              <textarea
                aria-label="Markdown 源码"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={handleTextareaPaste}
                onScroll={(event) => {
                  if (viewMode !== 'split') {
                    return;
                  }

                  const source = event.currentTarget;
                  const preview = splitPreviewViewportRef.current;

                  if (!preview) {
                    return;
                  }

                  const sourceScrollable = source.scrollHeight - source.clientHeight;

                  if (sourceScrollable <= 0) {
                    return;
                  }

                  const ratio = source.scrollTop / sourceScrollable;

                  if (lastScrollRatioRef.current !== null && Math.abs(lastScrollRatioRef.current - ratio) < 0.001) {
                    return;
                  }

                  lastScrollRatioRef.current = ratio;

                  if (scrollSyncFrameRef.current !== null) {
                    cancelAnimationFrame(scrollSyncFrameRef.current);
                  }

                  scrollSyncFrameRef.current = requestAnimationFrame(() => {
                    const previewScrollable = preview.scrollHeight - preview.clientHeight;

                    if (previewScrollable <= 0) {
                      return;
                    }

                    preview.scrollTop = ratio * previewScrollable;
                  });
                }}
                className="w-full flex-1 min-h-[420px] bg-transparent border-none resize-none focus:ring-0 font-mono text-sm leading-relaxed text-slate-700 dark:text-slate-300 outline-none"
              />
            </section>
            <section className="flex h-full min-h-[500px] flex-col rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-[#27272A] dark:bg-[#121212]">
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">实时预览</div>
              <div
                ref={splitPreviewViewportRef}
                data-testid="editor-preview-viewport"
                className="flex-1 overflow-auto"
              >
                <EditorContent editor={editor} className={editorContentClassName} />
              </div>
            </section>
          </div>
        ) : (
          <EditorContent editor={editor} className={editorContentClassName} />
        )}
      </div>
    </main>
  );
}

export default React.memo(EditorComponent);


















