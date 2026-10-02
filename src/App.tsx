import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { common, createLowlight } from 'lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { cn } from './lib/utils';
import CodeBlockComponent from './components/CodeBlockComponent';
import ResizableImageComponent from './components/ResizableImageComponent';
import { CalloutExtension } from './lib/calloutExtension';
import { TocExtension } from './lib/tocExtension';
import { MathInline, MathBlock } from './lib/mathExtension';
import { AlertTriangle } from 'lucide-react';
import { isTauriRuntime } from './services/native/environment';
import { getNativeFileMtime, readNativeFile } from './services/workspace/client';

import Header from './components/Header';
import SidebarLeft from './components/SidebarLeft';
import Editor from './components/Editor';
import SidebarRight from './components/SidebarRight';
import Footer from './components/Footer';
import { saveSnapshot } from './lib/timeline';
import { ThemeProvider } from './contexts/ThemeContext';
import { useSettings, SettingsProvider } from './contexts/SettingsContext';
import { matchShortcut } from './lib/shortcuts';
import { clearWorkspaceHandle, loadWorkspaceHandle, saveWorkspaceHandle } from './lib/workspacePersistence';
import { AIProvider } from './contexts/AIContext';
import { checkForUpdate, type ReleaseInfo } from './services/updater';

// Lazy-loaded modal components (deferred until explicitly opened)
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const AICenterModal = React.lazy(() => import('./components/AICenterModal'));
const AboutModal = React.lazy(() => import('./components/AboutModal'));
const UpdateModal = React.lazy(() => import('./components/UpdateModal'));
const UserManualModal = React.lazy(() => import('./components/UserManualModal'));
const ExportModal = React.lazy(() => import('./components/ExportModal'));
const TimelineModal = React.lazy(() => import('./components/TimelineModal'));
const KnowledgeSourceModal = React.lazy(() => import('./components/KnowledgeSourceModal'));
const QuickOpenModal = React.lazy(() => import('./components/QuickOpenModal'));
const FindReplaceModal = React.lazy(() => import('./components/FindReplaceModal'));
import {
  openFile,
  openDirectory,
  openImageFile,
  readFile,
  readWorkspaceEntries,
  restoreNativeWorkspace,
  writeFile,
  getLastOpenDirectoryError,
  type WorkspaceEntry,
  type WorkspaceFileEntry,
  type WorkspaceDirectoryEntry,
} from './lib/fileSystem';
import {
  createNativeWorkspaceDirectory,
  createNativeWorkspaceFileHandle,
  deleteNativeWorkspaceEntry,
  isNativeFileHandle,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
  renameNativeWorkspaceEntry,
  revealNativeWorkspaceEntry,
  writeNativeFileAsset,
  writeNativeWorkspaceBinary,
  writeNativeWorkspaceFile,
} from './services/workspace';
import { getNativeCliOpenFile, nativeClient, setNativeWindowTitle } from './services/native';

const lowlight = createLowlight(common);
const NATIVE_WORKSPACE_REFRESH_INTERVAL_MS = 5000;
const EMPTY_AI_RESPONSE_TEXT = '未返回内容';
const MARKDOWN_DATA_IMAGE_PATTERN =
  /!\[([^\]]*)\]\((data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml);base64,[^)]+)\)/gi;
type InsertProgressCallback = (message: string) => void;

function extractMarkdownDataImages(markdown: string) {
  MARKDOWN_DATA_IMAGE_PATTERN.lastIndex = 0;
  const images = Array.from(markdown.matchAll(MARKDOWN_DATA_IMAGE_PATTERN)).map((match) => ({
    markdown: match[0],
    alt: match[1] || 'AI 生成图片',
    src: match[2],
  }));
  MARKDOWN_DATA_IMAGE_PATTERN.lastIndex = 0;
  return images;
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

const imageExtensionByType: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
};

function getImageExtension(file: File) {
  return imageExtensionByType[file.type] ?? '';
}

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\|?*\x00-\x1F]/g, '-').trim();
}


function getImageFileName(file: File) {
  const rawName = file.name || '';
  const safeName = sanitizeFileName(rawName);
  const extension = getImageExtension(file) || '.png';

  const isGeneric = !safeName || /^(image|blob|clipboard|screenshot)(\.[^.]+)?$/i.test(safeName);
  if (isGeneric) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `image_${timestamp}${extension}`;
  }

  return safeName.includes('.') ? safeName : `${safeName}${extension}`;
}

function getImageExtensionFromMimeType(mimeType: string) {
  return imageExtensionByType[mimeType.toLowerCase()] ?? '.png';
}

async function dataUrlToImagePayload(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml));base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const [, mimeType] = match;

  try {
    const response = await fetch(dataUrl);
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    return {
      mimeType,
      bytes: new Uint8Array(buffer),
      blob: new Blob([buffer], { type: mimeType }),
    };
  } catch {
    return null;
  }
}

function splitFileName(fileName: string) {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot > 0) {
    return { base: fileName.slice(0, lastDot), ext: fileName.slice(lastDot) };
  }
  return { base: fileName, ext: '' };
}

function normalizeWorkspaceFileName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const sanitized = sanitizeFileName(trimmed);
  if (!sanitized || sanitized !== trimmed) {
    return null;
  }
  return sanitized.toLowerCase().endsWith('.md') ? sanitized : `${sanitized}.md`;
}

function normalizeWorkspaceFolderName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const sanitized = sanitizeFileName(trimmed);
  if (!sanitized || sanitized !== trimmed) {
    return null;
  }
  if (sanitized === '.' || sanitized === '..') {
    return null;
  }
  return sanitized;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

function resolveImageAssetsPath(
  baseName: string,
  settings: { imageStorageMode?: string; imageStoragePath?: string }
) {
  const mode = settings.imageStorageMode ?? 'filename-assets';

  if (mode === 'shared-assets') {
    return 'assets';
  }

  if (mode === 'custom') {
    const raw = settings.imageStoragePath?.trim() ?? '';
    if (!raw) {
      return '';
    }

    const replaced = raw.replace(/\$\{filename\}/g, baseName);
    const normalized = normalizePath(replaced).replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      return '';
    }

    const segments = normalized
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .map((segment) => sanitizeFileName(segment))
      .filter(Boolean);

    return segments.join('/');
  }

  return `${baseName}.assets`;
}



const initialContent = `# 无标题文档

开始写作..
`;

interface RecentFile {
  name: string;
  handle?: any;
}

interface WorkspaceSearchMatch {
  line: number;
  preview: string;
  highlights: { start: number; end: number }[];
  matchIndex: number;
}

interface WorkspaceSearchResult {
  entry: WorkspaceFileEntry;
  matchCount: number;
  matchedBy: 'content' | 'filename';
  matches: WorkspaceSearchMatch[];
}

function findWorkspaceFileEntry(entries: WorkspaceEntry[], path: string): WorkspaceFileEntry | null {
  for (const entry of entries) {
    if (entry.kind === 'file' && entry.path === path) {
      return entry;
    }

    if (entry.kind === 'directory') {
      const nestedMatch = findWorkspaceFileEntry(entry.children, path);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

function findWorkspaceDirectoryEntry(
  entries: WorkspaceEntry[],
  path: string
): WorkspaceDirectoryEntry | null {
  for (const entry of entries) {
    if (entry.kind === 'directory' && entry.path === path) {
      return entry;
    }

    if (entry.kind === 'directory') {
      const nestedMatch = findWorkspaceDirectoryEntry(entry.children, path);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

function getWorkspaceParentPath(path: string) {
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  if (segments.length === 0) {
    return null;
  }
  return segments.join('/');
}

function buildWorkspacePath(parentPath: string | null, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}

function getWorkspaceEntriesForDirectory(entries: WorkspaceEntry[], directoryPath: string | null) {
  if (!directoryPath) {
    return entries;
  }
  const directoryEntry = findWorkspaceDirectoryEntry(entries, directoryPath);
  return directoryEntry?.children ?? [];
}

function collectWorkspaceFiles(entries: WorkspaceEntry[], accumulator: WorkspaceFileEntry[] = []) {
  for (const entry of entries) {
    if (entry.kind === 'file') {
      accumulator.push(entry);
    } else if (entry.kind === 'directory') {
      collectWorkspaceFiles(entry.children, accumulator);
    }
  }

  return accumulator;
}

function buildWorkspaceEntriesSignature(entries: WorkspaceEntry[]) {
  const parts: string[] = [];
  const visit = (items: WorkspaceEntry[]) => {
    for (const entry of items) {
      parts.push(`${entry.kind}:${entry.path}`);
      if (entry.kind === 'directory') {
        visit(entry.children);
      }
    }
  };

  visit(entries);
  return parts.join('|');
}

function getPathBaseName(path: string) {
  const normalizedPath = normalizePath(path);
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments.at(-1) ?? normalizedPath;
}

function buildAppWindowTitle(fileName: string | null, workspaceName: string | null) {
  const parts = [fileName, workspaceName, 'Lumina Edit Pro'].filter(Boolean);
  return parts.join(' - ');
}

function isMarkdownFile(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
}

function removeTrailingEmptyAIResponses(markdown: string) {
  const lines = markdown.replace(/\s+$/g, '').split('\n');

  while (lines.length > 0 && lines[lines.length - 1].trim() === EMPTY_AI_RESPONSE_TEXT) {
    lines.pop();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
  }

  return lines.join('\n').trimEnd();
}

function hasMarkdownDataImage(markdown: string) {
  MARKDOWN_DATA_IMAGE_PATTERN.lastIndex = 0;
  const result = MARKDOWN_DATA_IMAGE_PATTERN.test(markdown);
  MARKDOWN_DATA_IMAGE_PATTERN.lastIndex = 0;
  return result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWorkspaceSearchPattern(
  query: string,
  options: { caseSensitive: boolean; wholeWord: boolean }
) {
  const escapedQuery = escapeRegex(query);
  if (!escapedQuery) {
    return null;
  }
  const pattern = options.wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery;
  const flags = options.caseSensitive ? 'g' : 'gi';
  return { pattern, flags };
}

function hasRegexMatch(text: string, pattern: string, flags: string) {
  const regex = new RegExp(pattern, flags);
  return regex.test(text);
}

function collectLineMatches(line: string, pattern: string, flags: string) {
  const regex = new RegExp(pattern, flags);
  const matches: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (match.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }
  }

  return matches;
}

function buildLinePreview(
  line: string,
  matches: { start: number; end: number }[],
  maxLength = 120
) {
  const firstMatch = matches[0];
  let start = 0;
  let end = line.length;

  if (line.length > maxLength) {
    const matchLength = firstMatch.end - firstMatch.start;
    const context = Math.max(12, Math.floor((maxLength - matchLength) / 2));
    start = Math.max(firstMatch.start - context, 0);
    end = start + maxLength;

    if (end > line.length) {
      end = line.length;
      start = Math.max(0, end - maxLength);
    }
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < line.length ? '…' : '';
  const base = line.slice(start, end);
  const preview = `${prefix}${base}${suffix}`;
  const offset = start - (prefix ? 1 : 0);

  const highlights = matches
    .filter((match) => match.end > start && match.start < end)
    .map((match) => ({
      start: Math.max(match.start, start) - offset,
      end: Math.min(match.end, end) - offset,
    }));

  return { preview, highlights };
}

function buildWorkspaceSearchMatches(content: string, pattern: string, flags: string) {
  const lines = content.split(/\r?\n/);
  const matches: WorkspaceSearchMatch[] = [];
  let totalMatches = 0;

  lines.forEach((line, index) => {
    const lineMatches = collectLineMatches(line, pattern, flags);
    if (lineMatches.length === 0) {
      return;
    }

    const matchIndex = totalMatches;
    totalMatches += lineMatches.length;
    const { preview, highlights } = buildLinePreview(line, lineMatches);

    matches.push({
      line: index + 1,
      preview,
      highlights,
      matchIndex,
    });
  });

  return { matches, totalMatches };
}

function getNextWorkspaceFileName(entries: WorkspaceEntry[]) {
  const rootNames = new Set(entries.map((entry) => entry.name.toLowerCase()));
  let index = 1;

  while (rootNames.has(`untitled-${index}.md`)) {
    index += 1;
  }

  return `Untitled-${index}.md`;
}

function getNextWorkspaceFolderName(entries: WorkspaceEntry[]) {
  const rootNames = new Set(entries.map((entry) => entry.name));
  let index = 1;
  let candidate = '\u65b0\u5efa\u6587\u4ef6\u5939';

  while (rootNames.has(candidate)) {
    index += 1;
    candidate = `\u65b0\u5efa\u6587\u4ef6\u5939 ${index}`;
  }

  return candidate;
}

function AppContent() {
  const { settings, updateSettings } = useSettings();
  const [content, setContent] = useState(initialContent);
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source' | 'split'>('wysiwyg');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('lumina-ai-panel-width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 300 && parsed <= 460) {
          return parsed;
        }
      }
    } catch {}
    return 390;
  });
  const [isResizingAiPanel, setIsResizingAiPanel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAICenterOpen, setIsAICenterOpen] = useState(false);
  const [isKnowledgeSourceOpen, setIsKnowledgeSourceOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [latestReleaseInfo, setLatestReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isExportDocxModalOpen, setIsExportDocxModalOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const fullscreenPanelStateRef = useRef<{ leftPanelOpen: boolean; aiPanelOpen: boolean } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeFileHandle, setActiveFileHandleState] = useState<any>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [searchOptions, setSearchOptions] = useState({ caseSensitive: false, wholeWord: false });
  const [searchNavigation, setSearchNavigation] = useState<{ direction: 'next' | 'prev'; token: number } | null>(null);
  const [searchJump, setSearchJump] = useState<{ index: number; token: number } | null>(null);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [searchActiveMatchIndex, setSearchActiveMatchIndex] = useState(0);
  const [headings, setHeadings] = useState<{ level: number; text: string; id: string; pos: number }[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [scrollToPos, setScrollToPos] = useState<{ pos: number; timestamp: number } | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceDirectoryHandle, setWorkspaceDirectoryHandle] = useState<any>(null);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>([]);
  const [workspaceWritable, setWorkspaceWritable] = useState(false);
  const [activeWorkspaceFilePath, setActiveWorkspaceFilePathState] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const activeDocumentName = activeWorkspaceFilePath
    ? getPathBaseName(activeWorkspaceFilePath)
    : activeFileHandle?.name ?? null;
  const appWindowTitle = buildAppWindowTitle(activeDocumentName, workspaceName);
  const documentId = useMemo(
    () => activeWorkspaceFilePath ?? activeFileHandle?.name ?? 'untitled',
    [activeWorkspaceFilePath, activeFileHandle]
  );
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');
  const [workspaceSearchOptions, setWorkspaceSearchOptions] = useState({ caseSensitive: false, wholeWord: false });
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [workspaceSearchStatus, setWorkspaceSearchStatus] = useState<'idle' | 'searching' | 'done'>('idle');
  const [workspaceSearchHasFallback, setWorkspaceSearchHasFallback] = useState(false);
  const workspaceContentCacheRef = useRef<Map<string, string>>(new Map());
  const workspaceSearchTokenRef = useRef(0);
  const lastSavedContentRef = useRef<string>('');
  const contentRef = useRef(content);
  const activeFileHandleRef = useRef<any>(activeFileHandle);
  const activeWorkspaceFilePathRef = useRef<string | null>(activeWorkspaceFilePath);
  const toastTimerRef = useRef<number | null>(null);
  const localDraftImageWarningRef = useRef(false);
  const absolutePathWarningRef = useRef(false);
  const leftPanelWidthRef = useRef(leftPanelWidth);
  const aiPanelWidthRef = useRef(aiPanelWidth);
  const autoSaveErrorRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const isFileSwitchingRef = useRef(false);
  const nativeWorkspaceRefreshWarningRef = useRef(false);
  const pendingUpdateTimerRef = useRef<number | null>(null);
  const isUpdatingFromEditorRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pendingUpdateTimerRef.current !== null) {
        clearTimeout(pendingUpdateTimerRef.current);
      }
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setAiPanelWidth((prev) => {
        const availableForAi = Math.max(300, window.innerWidth - (leftPanelOpen ? leftPanelWidth : 0) - 360);
        const maxWidth = Math.min(600, Math.min(availableForAi, Math.floor(window.innerWidth * 0.55)));
        return Math.min(prev, Math.max(300, maxWidth));
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leftPanelOpen, leftPanelWidth]);
  const setActiveFileHandle = (nextHandle: any) => {
    activeFileHandleRef.current = nextHandle;
    setActiveFileHandleState(nextHandle);
  };

  const setActiveWorkspaceFilePath = (nextPath: string | null) => {
    activeWorkspaceFilePathRef.current = nextPath;
    setActiveWorkspaceFilePathState(nextPath);
  };

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    activeFileHandleRef.current = activeFileHandle;
  }, [activeFileHandle]);

  useEffect(() => {
    activeWorkspaceFilePathRef.current = activeWorkspaceFilePath;
  }, [activeWorkspaceFilePath]);

  // Auto-save effect (only runs when autoSave is enabled AND content has actually changed)
  useEffect(() => {
    if (!settings.autoSave) return;

    // Fast bail out: if content has not changed, or currently switching files, do NOTHING
    if (isFileSwitchingRef.current || lastSavedContentRef.current === content) {
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const delayMs = Math.max(3000, (settings.autoSaveInterval || 3) * 1000);
    const targetHandle = activeFileHandle;
    const targetPath = activeWorkspaceFilePath;
    const targetContent = content;

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;

      // Re-verify after debounce delay: must NOT be switching files and target must match
      if (
        isFileSwitchingRef.current ||
        activeFileHandleRef.current !== targetHandle ||
        activeWorkspaceFilePathRef.current !== targetPath ||
        lastSavedContentRef.current === targetContent
      ) {
        return;
      }

      if (targetContent.length > 500_000 && hasMarkdownDataImage(targetContent)) {
        if (!localDraftImageWarningRef.current) {
          showWarningToast('当前文档包含较大的内嵌 AI 图片，已跳过本地草稿缓存；建议打开可写工作区或保存文件。');
          localDraftImageWarningRef.current = true;
        }
      } else {
        try {
          localStorage.setItem('lumina-content', targetContent);
          localDraftImageWarningRef.current = false;
        } catch (error) {
          console.error('Local draft save error:', error);
          if (!localDraftImageWarningRef.current) {
            showWarningToast('本地草稿缓存空间不足，请保存到磁盘或打开可写工作区。');
            localDraftImageWarningRef.current = true;
          }
        }
      }

      const canWrite =
        targetHandle &&
        (isNativeFileHandle(targetHandle) ||
          typeof (targetHandle as any).createWritable === 'function' ||
          isNativeWorkspaceFileHandle(targetHandle));

      if (!canWrite) {
        return;
      }

      writeFile(targetHandle, targetContent)
        .then(() => {
          autoSaveErrorRef.current = false;
          if (activeFileHandleRef.current === targetHandle) {
            lastSavedContentRef.current = targetContent;
            if (targetPath) {
              workspaceContentCacheRef.current.set(targetPath, targetContent);
            }
          }
        })
        .catch((error) => {
          console.error('Auto-save error:', error);
          if (!autoSaveErrorRef.current) {
            showErrorToast('自动保存到磁盘失败，请检查文件权限后重试');
            autoSaveErrorRef.current = true;
          }
        });
    }, delayMs);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [content, settings.autoSave, settings.autoSaveInterval, activeFileHandle, activeWorkspaceFilePath]);

  useEffect(() => {
    document.title = appWindowTitle;
    setNativeWindowTitle(appWindowTitle).catch((error) => {
      console.error('Error syncing native window title:', error);
    });
  }, [appWindowTitle]);

  useEffect(() => {
    leftPanelWidthRef.current = leftPanelWidth;
  }, [leftPanelWidth]);

  useEffect(() => {
    aiPanelWidthRef.current = aiPanelWidth;
  }, [aiPanelWidth]);

  useEffect(() => {
    if (!isResizingLeftPanel) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const minWidth = 220;
      const maxWidth = Math.min(520, Math.floor(window.innerWidth * 0.6));
      const nextWidth = Math.max(minWidth, Math.min(event.clientX, maxWidth));
      if (nextWidth !== leftPanelWidthRef.current) {
        setLeftPanelWidth(nextWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeftPanel(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeftPanel]);

  useEffect(() => {
    if (!isResizingAiPanel) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const availableForAi = Math.max(300, window.innerWidth - (leftPanelOpen ? leftPanelWidth : 0) - 360);
      const minWidth = 300;
      const maxWidth = Math.min(600, Math.min(availableForAi, Math.floor(window.innerWidth * 0.55)));
      const nextWidth = Math.max(minWidth, Math.min(window.innerWidth - event.clientX, maxWidth));
      if (nextWidth !== aiPanelWidthRef.current) {
        setAiPanelWidth(nextWidth);
        try {
          localStorage.setItem('lumina-ai-panel-width', String(nextWidth));
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsResizingAiPanel(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingAiPanel]);

  const extensions = useMemo(() => [
    StarterKit.configure({
      codeBlock: false,
      link: false,
      paragraph: false,
      heading: false,
    }),
    Paragraph.extend({
      addAttributes() {
        return {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('align') ||
              element.style.textAlign ||
              element.closest('[align]')?.getAttribute('align') ||
              null,
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.textAlign) return {};
              return {
                style: `text-align: ${attributes.textAlign};`,
                align: attributes.textAlign,
              };
            },
          },
        };
      },
    }),
    Heading.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('align') ||
              element.style.textAlign ||
              element.closest('[align]')?.getAttribute('align') ||
              null,
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.textAlign) return {};
              return {
                style: `text-align: ${attributes.textAlign};`,
                align: attributes.textAlign,
              };
            },
          },
        };
      },
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'auto',
    }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockComponent)
      },
    }),
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    Image.configure({
      inline: true,
    }).extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          width: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('width') || element.style.width || null,
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.width) return {};
              const w = isNaN(Number(attributes.width))
                ? attributes.width
                : `${attributes.width}px`;
              return { width: attributes.width, style: `width: ${w}` };
            },
          },
          alignment: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-align') ||
              element.getAttribute('align') ||
              element.closest('[align]')?.getAttribute('align') ||
              null,
            renderHTML: (attributes: Record<string, any>) => {
              if (!attributes.alignment) return {};
              return {
                'data-align': attributes.alignment,
              };
            },
          },
        };
      },
      addNodeView() {
        return ReactNodeViewRenderer(ResizableImageComponent);
      },
    }),
    Markdown,
    Table.configure({
      resizable: true,
      handleWidth: 7,
      cellMinWidth: 48,
      lastColumnResizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    MathInline,
    MathBlock,
    CalloutExtension,
    TocExtension,
  ], []);

  const ensureWritableImageTarget = (options: { showError?: boolean } = {}) => {
    const { showError = true } = options;
    const currentFileHandle = activeFileHandleRef.current;

    if (
      workspaceWritable &&
      workspaceDirectoryHandle &&
      activeWorkspaceFilePath
    ) {
      const normalizedPath = normalizePath(activeWorkspaceFilePath);
      const pathSegments = normalizedPath.split('/').filter(Boolean);
      const fileName = pathSegments.pop() || 'Document.md';
      const baseName = sanitizeFileName(fileName.replace(/\.[^/.]+$/, '') || 'Document') || 'Document';
      const assetsPath = resolveImageAssetsPath(baseName, settings);

      if (!assetsPath) {
        if (showError) {
          showErrorToast('图片保存路径无效，请在设置中修改');
        }
        return null;
      }

      const assetsSegments = assetsPath.split('/').filter(Boolean);

      return {
        kind: 'workspace' as const,
        dirSegments: pathSegments,
        assetsSegments,
        assetsPath,
      };
    }

    if (isNativeFileHandle(currentFileHandle)) {
      const fileName = currentFileHandle.name || getPathBaseName(currentFileHandle.path) || 'Document.md';
      const baseName = sanitizeFileName(fileName.replace(/\.[^/.]+$/, '') || 'Document') || 'Document';
      const assetsPath = resolveImageAssetsPath(baseName, settings);

      if (!assetsPath) {
        if (showError) {
          showErrorToast('图片保存路径无效，请在设置中修改');
        }
        return null;
      }

      return {
        kind: 'native-single-file' as const,
        filePath: currentFileHandle.path,
        assetsPath,
      };
    }

    if (showError) {
      showErrorToast('请先打开可写工作区，或打开磁盘上的 Markdown 文件后再导入图片');
    }
    return null;
  };

  const getAssetsDirectoryHandle = async (assetsDirSegments: string[]) => {
    let currentHandle = workspaceDirectoryHandle;
    for (const segment of assetsDirSegments) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
    }
    return currentHandle;
  };

  const fileExists = async (dirHandle: any, fileName: string) => {
    try {
      await dirHandle.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  };

  const getUniqueFileName = async (dirHandle: any, fileName: string) => {
    if (!(await fileExists(dirHandle, fileName))) {
      return fileName;
    }

    const { base, ext } = splitFileName(fileName);
    let index = 1;
    let candidate = `${base}-${index}${ext}`;

    while (await fileExists(dirHandle, candidate)) {
      index += 1;
      candidate = `${base}-${index}${ext}`;
    }

    return candidate;
  };

  const getUniqueNativeImageFileName = (directorySegments: string[], fileName: string) => {
    const assetsEntries = collectWorkspaceFiles(workspaceEntries);
    const usedPaths = new Set(assetsEntries.map((entry) => entry.path.toLowerCase()));
    const { base, ext } = splitFileName(fileName);
    let candidate = fileName;
    let index = 1;

    while (usedPaths.has([...directorySegments, candidate].join('/').toLowerCase())) {
      candidate = `${base}-${index}${ext}`;
      index += 1;
    }

    return candidate;
  };

  const saveImageToWorkspace = async (file: File, options: { showError?: boolean } = {}) => {
    const { showError = true } = options;
    const target = ensureWritableImageTarget({ showError: false });
    if (!target) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          showToast('未保存的新建文档已临时内嵌截图；保存文件后新截图将自动归档至 .assets 目录', 'info');
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }

    try {
      const initialName = getImageFileName(file);
      const bytes = new Uint8Array(await file.arrayBuffer());

      if (target.kind === 'native-single-file') {
        const requestedPath = `${target.assetsPath}/${initialName}`;
        const result = await writeNativeFileAsset(target.filePath, requestedPath, bytes);
        showToast(`截图已自动归档至：${result.relativePath}`, 'info');
        return result.relativePath;
      }

      const assetsSegments = [...target.dirSegments, ...target.assetsSegments];

      if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
        const finalName = getUniqueNativeImageFileName(assetsSegments, initialName);
        const assetPath = [...assetsSegments, finalName].join('/');
        await writeNativeWorkspaceBinary(workspaceDirectoryHandle.workspaceId, assetPath, bytes);
        await refreshWorkspace(workspaceDirectoryHandle);
        showToast(`截图已自动归档至：${target.assetsPath}/${finalName}`, 'info');
        return `${target.assetsPath}/${finalName}`;
      }

      const assetsHandle = await getAssetsDirectoryHandle(assetsSegments);
      const finalName = await getUniqueFileName(assetsHandle, initialName);

      const fileHandle = await assetsHandle.getFileHandle(finalName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      showToast(`截图已自动归档至：${target.assetsPath}/${finalName}`, 'info');
      return `${target.assetsPath}/${finalName}`;
    } catch (error) {
      console.error('Error saving image:', error);
      if (showError) {
        showErrorToast('图片保存失败，请检查文件或工作区权限');
      }
      return null;
    }
  };

  const createGeneratedImageFile = async (dataUrl: string, alt: string) => {
    const payload = await dataUrlToImagePayload(dataUrl);
    if (!payload) {
      throw new Error('Failed to load generated image bytes');
    }
    const type = payload.mimeType || 'image/png';
    const extension = getImageExtensionFromMimeType(type);
    const safeAlt = sanitizeFileName(alt).replace(/\s+/g, '-').slice(0, 32) || 'ai-image';
    return new File([payload.blob], `ai-${safeAlt}-${Date.now()}${extension}`, { type });
  };

  const handlePersistGeneratedImage = async (
    image: { dataUrl: string; alt: string },
    options: { showError?: boolean } = {}
  ) => {
    const file = await createGeneratedImageFile(image.dataUrl, image.alt);
    return await saveImageToWorkspace(file, options);
  };

  const replaceInlineDataImagesWithWorkspaceFiles = async (
    markdown: string,
    options: {
      strict?: boolean;
      showSavedToast?: boolean;
      onProgress?: InsertProgressCallback;
      allowInlineFallback?: boolean;
    } = {}
  ) => {
    const { strict = true, showSavedToast = true, onProgress, allowInlineFallback = false } = options;
    const matches = Array.from(markdown.matchAll(MARKDOWN_DATA_IMAGE_PATTERN));
    if (matches.length === 0) {
      return markdown;
    }

    if (!ensureWritableImageTarget({ showError: false })) {
      const message = '请先打开可写工作区，或打开磁盘上的 Markdown 文件，AI 图片会保存为资产文件后再插入链接。';
      if (allowInlineFallback) {
        onProgress?.('当前没有可用资产目录，将以内嵌图片插入正文...');
        return markdown;
      }
      if (strict) {
        throw new Error(message);
      }
      showWarningToast('AI 图片尚未保存为本地资产；打开 Markdown 文件或可写工作区后重新生成，可在历史记录中长期恢复图片。');
      return markdown;
    }

    let result = '';
    let cursor = 0;
    let savedCount = 0;
    let attemptedCount = 0;

    for (const match of matches) {
      const fullMatch = match[0];
      const altText = match[1] || 'AI 生成图片';
      const dataUrl = match[2];
      const startIndex = match.index ?? 0;
      attemptedCount += 1;
      onProgress?.(`正在保存第 ${attemptedCount}/${matches.length} 张 AI 图片到本地资产...`);
      await waitForNextPaint();

      result += markdown.slice(cursor, startIndex);

      let relativePath: string | null = null;
      try {
        relativePath = await handlePersistGeneratedImage(
          { dataUrl, alt: altText },
          { showError: !allowInlineFallback && strict }
        );
      } catch (error) {
        console.error('Error saving AI image:', error);
      }
      if (relativePath) {
        savedCount += 1;
        result += `![${altText}](${relativePath})`;
      } else {
        const message = 'AI 图片保存为本地资产文件失败，请检查工作区权限后重试。';
        if (allowInlineFallback) {
          onProgress?.('资产文件保存失败，将以内嵌图片插入正文...');
          result += fullMatch;
          cursor = startIndex + fullMatch.length;
          continue;
        }
        if (strict) {
          throw new Error(message);
        }
        showWarningToast(message);
        result += fullMatch;
      }
      cursor = startIndex + fullMatch.length;
    }

    result += markdown.slice(cursor);

    if (savedCount > 0 && showSavedToast) {
      showToast(`已保存 ${savedCount} 张 AI 图片到文档资源目录`);
      await refreshWorkspace(workspaceDirectoryHandle);
    }

    return result;
  };

  const persistGeneratedAIAssets = async (markdown: string) =>
    replaceInlineDataImagesWithWorkspaceFiles(markdown, { strict: false, showSavedToast: true });

  const insertImageIntoView = (view: any, src: string) => {
    const imageNode = view.state.schema.nodes.image;
    if (!imageNode) {
      return;
    }

    const node = imageNode.create({ src });
    const transaction = view.state.tr.replaceSelectionWith(node).scrollIntoView();
    view.dispatch(transaction);
  };

  const handleInsertImageFromFile = async (file: File) => {
    const relativePath = await saveImageToWorkspace(file);
    if (!relativePath) {
      return;
    }

    editor?.chain().focus().setImage({ src: relativePath }).run();
  };

  const handleInsertImageFromPicker = async () => {
    const file = await openImageFile();
    if (!file) {
      return;
    }

    await handleInsertImageFromFile(file);
  };

  const handleImagePaste = (view: any, event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) {
      return false;
    }

    const imageItem = Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) {
      return false;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return false;
    }

    event.preventDefault();

    void saveImageToWorkspace(file).then((relativePath) => {
      if (!relativePath) {
        return;
      }
      insertImageIntoView(view, relativePath);
    });

    return true;
  };

  const handleImageDrop = (view: any, event: DragEvent) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return false;
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return false;
    }

    event.preventDefault();

    const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });

    imageFiles.forEach((file) => {
      void saveImageToWorkspace(file).then((relativePath) => {
        if (!relativePath) {
          return;
        }
        if (coordinates && typeof coordinates.pos === 'number') {
          const imageNode = view.state.schema.nodes.image;
          if (imageNode) {
            const node = imageNode.create({ src: relativePath });
            const tr = view.state.tr.insert(coordinates.pos, node);
            view.dispatch(tr.scrollIntoView());
            return;
          }
        }
        insertImageIntoView(view, relativePath);
      });
    });

    return true;
  };

  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      isUpdatingFromEditorRef.current = true;
      if (pendingUpdateTimerRef.current !== null) {
        clearTimeout(pendingUpdateTimerRef.current);
      }

      pendingUpdateTimerRef.current = window.setTimeout(() => {
        pendingUpdateTimerRef.current = null;
        const md = (editor.storage as any).markdown?.getMarkdown?.() ?? '';
        contentRef.current = md;
        setContent(md);

        const newHeadings: { level: number; text: string; id: string; pos: number }[] = [];
        editor.state.doc.descendants((node: any, pos: number) => {
          if (node.type.name === 'heading') {
            const anchorPos = pos + 1;

            newHeadings.push({
              level: node.attrs.level,
              text: node.textContent,
              id: `heading-${anchorPos}`,
              pos: anchorPos,
            });
          }
        });
        setHeadings(newHeadings);
        isUpdatingFromEditorRef.current = false;
      }, 350);
    },
    editorProps: {
      attributes: {
        class: 'prose-custom focus:outline-none min-h-[500px]',
      },
      handlePaste: (view, event) => handleImagePaste(view, event as ClipboardEvent),
      handleDrop: (view, event) => handleImageDrop(view, event as DragEvent),
    },
  });

  const handleCheckUpdate = async (isManual = true) => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    if (isManual) {
      showToast('正在检查最新版本...', 'info');
    }
    try {
      const result = await checkForUpdate({
        feedUrl: settings.updateFeedUrl,
        githubToken: settings.githubToken,
      });

      if (result.hasUpdate && result.latestRelease) {
        setLatestReleaseInfo(result.latestRelease);
        setIsUpdateModalOpen(true);
      } else if (isManual) {
        if (result.error) {
          showToast(result.error, 'warning');
        } else {
          showToast(`当前已是最新版本 (v${result.currentVersion})`, 'info');
        }
      }
    } catch (err: any) {
      if (isManual) {
        showToast(err?.message || '检查更新失败，请检查网络', 'error');
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (settings.autoCheckUpdate !== false) {
      const timer = setTimeout(() => {
        void handleCheckUpdate(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [settings.autoCheckUpdate]);
  // Sync content from state to editor (for file opens)
  useEffect(() => {
    if (editor && !editor.isFocused && !isUpdatingFromEditorRef.current) {
      const currentMd = (editor.storage as any).markdown?.getMarkdown?.();
      if (content !== currentMd) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('lumina-content');
    if (saved) {
      setContent(saved);
      if (editor) editor.commands.setContent(saved);
    }

    const savedRecent = localStorage.getItem('lumina-recent-files');
    if (savedRecent) {
      try {
        const parsed = JSON.parse(savedRecent);
        if (Array.isArray(parsed)) {
          setRecentFiles(
            parsed
              .filter((file): file is { name: string } => typeof file?.name === 'string')
              .map((file) => ({ name: file.name }))
          );
        }
      } catch (error) {
        console.error('Error loading recent files:', error);
        localStorage.removeItem('lumina-recent-files');
      }
    }
  }, [editor]);

  const showToast = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  const showErrorToast = (message: string) => {
    showToast(message, 'error');
  };

  const showWarningToast = (message: string) => {
    showToast(message, 'warning');
  };

  useEffect(() => {
    let cancelled = false;

    const restoreWorkspace = async () => {
      try {
        const cliFile = await getNativeCliOpenFile();
        if (cliFile && !cancelled) {
          const handle = {
            source: 'tauri-single-file',
            path: cliFile.path,
            name: cliFile.name,
          };
          setActiveFileHandle(handle);
          setActiveWorkspaceFilePath(null);
          syncDocumentContent(cliFile.content);
          storeRecentFile(cliFile.name, handle);
          return;
        }
      } catch (error) {
        console.error('Error opening file from CLI args:', error);
      }

      try {
        const nativeWorkspace = await restoreNativeWorkspace();
        if (nativeWorkspace) {
          if (cancelled) return;

          setWorkspaceName(nativeWorkspace.name);
          setWorkspaceDirectoryHandle(nativeWorkspace.directoryHandle);
          setWorkspaceEntries(nativeWorkspace.entries);
          setWorkspaceWritable(nativeWorkspace.writable);
          setActiveWorkspaceFilePath(null);
          return;
        }
      } catch (error) {
        console.error('Restore native workspace error:', error);
        showWarningToast('恢复本地工作区失败，请重新打开工作区');
        return;
      }

      const savedHandle = await loadWorkspaceHandle();
      if (!savedHandle) {
        return;
      }

      try {
        if (typeof savedHandle.queryPermission === 'function') {
          let permission = await savedHandle.queryPermission({ mode: 'readwrite' });
          if (permission !== 'granted' && typeof savedHandle.requestPermission === 'function') {
            try {
              permission = await savedHandle.requestPermission({ mode: 'readwrite' });
            } catch {
              // Ignore request failures (likely missing user gesture)
            }
          }
          if (permission !== 'granted') {
            showWarningToast('已记住工作区，但需要重新授权。请通过“打开工作区”重新选择。');
            return;
          }
        }

        const entries = await readWorkspaceEntries(savedHandle);
        if (cancelled) return;

        setWorkspaceName(savedHandle.name);
        setWorkspaceDirectoryHandle(savedHandle);
        setWorkspaceEntries(entries);
        setWorkspaceWritable(
          typeof savedHandle?.getFileHandle === 'function' &&
          typeof savedHandle?.getDirectoryHandle === 'function'
        );
        setActiveWorkspaceFilePath(null);
      } catch (error) {
        console.error('Restore workspace error:', error);
        showWarningToast('恢复工作区失败，请重新打开工作区');
      }
    };

    void restoreWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncDocumentContent = (nextContent: string) => {
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (pendingUpdateTimerRef.current !== null) {
      clearTimeout(pendingUpdateTimerRef.current);
      pendingUpdateTimerRef.current = null;
    }
    isUpdatingFromEditorRef.current = false;

    setContent(nextContent);
    contentRef.current = nextContent;
    lastSavedContentRef.current = nextContent;
    if (editor) {
      editor.commands.setContent(nextContent);
    }
  };

  const applyDocumentContentEdit = (nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
    if (editor) {
      editor.commands.setContent(nextContent);
    }
  };

  const appendDataImagesToEditorEnd = async (
    images: Array<{ alt: string; src: string }>,
    baseMarkdown: string
  ) => {
    if (!editor || images.length === 0) {
      return false;
    }

    applyDocumentContentEdit(baseMarkdown);
    await waitForNextPaint();

    const imageNodes = images.flatMap((image, index) => {
      const nodes: Array<Record<string, unknown>> = [
        {
          type: 'image',
          attrs: {
            src: image.src,
            alt: image.alt,
          },
        },
      ];

      if (index < images.length - 1) {
        nodes.push({ type: 'paragraph' });
      }

      return nodes;
    });

    const docEnd = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .insertContentAt(docEnd, baseMarkdown ? [{ type: 'paragraph' }, ...imageNodes] : imageNodes)
      .scrollIntoView()
      .run();

    await waitForNextPaint();

    const nextMarkdown = (editor.storage as any)?.markdown?.getMarkdown?.();
    if (typeof nextMarkdown === 'string') {
      setContent(nextMarkdown);
      contentRef.current = nextMarkdown;
    }

    return true;
  };

  const appendDocumentContentAtEnd = async (
    text: string,
    options: { onProgress?: InsertProgressCallback } = {}
  ) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    options.onProgress?.('正在准备插入内容...');
    showToast('正在插入到文档末尾...');
    await waitForNextPaint();

    let insertText = trimmedText;
    try {
      insertText = await replaceInlineDataImagesWithWorkspaceFiles(trimmedText, {
        strict: true,
        showSavedToast: true,
        onProgress: options.onProgress,
        allowInlineFallback: true,
      });
    } catch (error) {
      console.error('Error preparing AI content insertion:', error);
      showErrorToast((error as Error | undefined)?.message || 'AI 图片保存失败，未插入到文档。');
      throw error;
    }

    options.onProgress?.('正在写入正文末尾...');
    await waitForNextPaint();

    const editorMarkdown = (editor?.storage as any)?.markdown?.getMarkdown?.();
    const currentMarkdown = typeof editorMarkdown === 'string' ? editorMarkdown : contentRef.current;
    const baseMarkdown = removeTrailingEmptyAIResponses(currentMarkdown);
    const inlineDataImages = extractMarkdownDataImages(insertText);

    if (inlineDataImages.length > 0) {
      const inserted = await appendDataImagesToEditorEnd(inlineDataImages, baseMarkdown);
      if (inserted) {
        showToast('已插入图片到文档末尾');
        return;
      }
    }

    const nextContent = baseMarkdown ? `${baseMarkdown}\n\n${insertText}` : insertText;

    applyDocumentContentEdit(nextContent);

    window.setTimeout(() => {
      const docEnd = editor?.state?.doc?.content?.size;
      if (typeof docEnd === 'number') {
        editor?.commands?.setTextSelection?.(docEnd);
        editor?.commands?.scrollIntoView?.();
      }
    }, 0);

    showToast('已插入到文档末尾');
  };

  const storeRecentFile = (name: string, handle?: any) => {
    const nextRecentFiles = [{ name, handle }, ...recentFiles.filter((file) => file.name !== name)].slice(0, 5);
    setRecentFiles(nextRecentFiles);
    localStorage.setItem(
      'lumina-recent-files',
      JSON.stringify(nextRecentFiles.map((file) => ({ name: file.name })))
    );
  };

  const pruneMissingWorkspaceFiles = (nextEntries: WorkspaceEntry[]) => {
    const availablePaths = new Set(collectWorkspaceFiles(nextEntries).map((entry) => entry.path));

    for (const cachedPath of Array.from(workspaceContentCacheRef.current.keys())) {
      if (!availablePaths.has(cachedPath)) {
        workspaceContentCacheRef.current.delete(cachedPath);
      }
    }

    if (activeWorkspaceFilePath && !availablePaths.has(activeWorkspaceFilePath)) {
      setActiveWorkspaceFilePath(null);
      setActiveFileHandle(null);
      syncDocumentContent(initialContent);
    }
  };

  const refreshWorkspace = async (
    directoryHandle: any,
    options: { pruneMissingFiles?: boolean } = {}
  ) => {
    if (!directoryHandle) {
      return [] as WorkspaceEntry[];
    }

    const nextEntries = await readWorkspaceEntries(directoryHandle);
    const nextSignature = buildWorkspaceEntriesSignature(nextEntries);
    setWorkspaceEntries((currentEntries) =>
      buildWorkspaceEntriesSignature(currentEntries) === nextSignature ? currentEntries : nextEntries
    );
    if (options.pruneMissingFiles) {
      pruneMissingWorkspaceFiles(nextEntries);
    }
    return nextEntries;
  };

  const handleRefreshWorkspace = async () => {
    if (!workspaceDirectoryHandle) {
      showWarningToast('请先打开工作区后再刷新');
      return;
    }

    try {
      await refreshWorkspace(workspaceDirectoryHandle, { pruneMissingFiles: true });
      showToast('工作区已刷新');
    } catch (error) {
      console.error('Error refreshing workspace:', error);
      showErrorToast('刷新工作区失败，请检查文件夹权限后重试');
    }
  };

  useEffect(() => {
    if (!isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      return;
    }

    let cancelled = false;

    const doRefresh = () => {
      if (document.hidden) return; // Suspend background disk polling when window is hidden/minimized

      refreshWorkspace(workspaceDirectoryHandle, { pruneMissingFiles: true })
        .then(() => {
          nativeWorkspaceRefreshWarningRef.current = false;
        })
        .catch((error) => {
          console.error('Error auto-refreshing native workspace:', error);
          if (!cancelled && !nativeWorkspaceRefreshWarningRef.current) {
            showWarningToast('自动刷新工作区失败，可手动刷新或重新打开工作区');
            nativeWorkspaceRefreshWarningRef.current = true;
          }
        });
    };

    const timer = window.setInterval(doRefresh, NATIVE_WORKSPACE_REFRESH_INTERVAL_MS);

    // Instantly refresh when user focuses back on the application window
    const handleFocus = () => {
      if (!cancelled && !document.hidden) {
        doRefresh();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [workspaceDirectoryHandle, activeWorkspaceFilePath]);

  useEffect(() => {
    workspaceContentCacheRef.current.clear();
    setWorkspaceSearchResults([]);
    setWorkspaceSearchStatus('idle');
    setWorkspaceSearchHasFallback(false);
    setWorkspaceSearchQuery('');
  }, [workspaceDirectoryHandle]);

  const readWorkspaceEntryContent = async (entry: WorkspaceFileEntry) => {
    const cache = workspaceContentCacheRef.current;
    if (cache.has(entry.path)) {
      return { readable: true, content: cache.get(entry.path) ?? '' };
    }

    try {
      if (entry.handle && typeof entry.handle.getFile === 'function') {
        const content = await readFile(entry.handle);
        cache.set(entry.path, content);
        return { readable: true, content };
      }

      if (entry.file && typeof entry.file.text === 'function') {
        const content = await readFile(entry.file);
        cache.set(entry.path, content);
        return { readable: true, content };
      }
    } catch (error) {
      console.error('Error reading workspace file:', error);
    }

    return { readable: false, content: '' };
  };

  const buildWorkspaceDocContext = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return '';
    if (!workspaceEntries.length) return '';

    const patternData = buildWorkspaceSearchPattern(trimmed, { caseSensitive: false, wholeWord: false });
    if (!patternData) return '';
    const { pattern, flags } = patternData;

    const files = collectWorkspaceFiles(workspaceEntries).filter((entry) => isMarkdownFile(entry.name));
    const maxHits = 8;
    const maxPerFile = 2;
    const hits: string[] = [];

    for (const entry of files) {
      if (activeWorkspaceFilePath && entry.path === activeWorkspaceFilePath) continue;
      const { readable, content } = await readWorkspaceEntryContent(entry);
      if (!readable) continue;
      const { matches } = buildWorkspaceSearchMatches(content, pattern, flags);
      if (matches.length === 0) continue;
      for (const match of matches.slice(0, maxPerFile)) {
        hits.push(`- 【${entry.name}#L${match.line}】${match.preview}`);
        if (hits.length >= maxHits) break;
      }
      if (hits.length >= maxHits) break;
    }

    if (!hits.length) return '';
    return `文档检索（工作区）：\n${hits.join('\n')}`;
  };

  useEffect(() => {
    const query = workspaceSearchQuery.trim();
    if (!query) {
      setWorkspaceSearchResults([]);
      setWorkspaceSearchStatus('idle');
      setWorkspaceSearchHasFallback(false);
      return;
    }

    const patternData = buildWorkspaceSearchPattern(query, workspaceSearchOptions);
    if (!patternData) {
      setWorkspaceSearchResults([]);
      setWorkspaceSearchStatus('idle');
      setWorkspaceSearchHasFallback(false);
      return;
    }

    const { pattern, flags } = patternData;
    const token = workspaceSearchTokenRef.current + 1;
    workspaceSearchTokenRef.current = token;
    setWorkspaceSearchStatus('searching');
    const timer = window.setTimeout(() => {
      const files = collectWorkspaceFiles(workspaceEntries);

      void (async () => {
        const results: WorkspaceSearchResult[] = [];
        let hasFallback = false;

        for (const entry of files) {
          const { readable, content } = await readWorkspaceEntryContent(entry);

          if (workspaceSearchTokenRef.current !== token) {
            return;
          }

          if (readable) {
            const { matches, totalMatches } = buildWorkspaceSearchMatches(content, pattern, flags);
            if (totalMatches > 0) {
              results.push({
                entry,
                matchCount: totalMatches,
                matchedBy: 'content',
                matches,
              });
            }
          } else {
            const nameMatches = hasRegexMatch(entry.name, pattern, flags);
            if (nameMatches) {
              hasFallback = true;
              results.push({
                entry,
                matchCount: 0,
                matchedBy: 'filename',
                matches: [],
              });
            }
          }
        }

        if (workspaceSearchTokenRef.current === token) {
          setWorkspaceSearchResults(results);
          setWorkspaceSearchStatus('done');
          setWorkspaceSearchHasFallback(hasFallback);
        }
      })();
    }, 200);

    return () => clearTimeout(timer);
  }, [workspaceEntries, workspaceSearchQuery, workspaceSearchOptions.caseSensitive, workspaceSearchOptions.wholeWord]);

  const handleSaveFile = async () => {
    if (pendingUpdateTimerRef.current !== null) {
      clearTimeout(pendingUpdateTimerRef.current);
      pendingUpdateTimerRef.current = null;
    }
    if (editor && editor.isFocused) {
      const freshMd = (editor.storage as any).markdown?.getMarkdown?.();
      if (typeof freshMd === 'string') {
        contentRef.current = freshMd;
        setContent(freshMd);
      }
    }
    const currentFileHandle = activeFileHandleRef.current;
    const currentWorkspaceFilePath = activeWorkspaceFilePathRef.current;
    const currentContent = contentRef.current;

    if (currentFileHandle) {
      try {
        await writeFile(currentFileHandle, currentContent);
        lastSavedContentRef.current = currentContent;
        if (currentWorkspaceFilePath) {
          workspaceContentCacheRef.current.set(currentWorkspaceFilePath, currentContent);
        }
        const docKey = currentWorkspaceFilePath || (currentFileHandle as any)?.path || (currentFileHandle as any)?.name || 'current_doc';
        saveSnapshot(docKey, currentContent, 'save');
        if ((currentFileHandle as any)?.path) {
          getNativeFileMtime((currentFileHandle as any).path).then((mtime) => {
            lastKnownMtimeRef.current = mtime;
          }).catch(() => {});
        }
        showToast('已保存到磁盘');
      } catch (error) {
        console.error('Error saving file:', error);
        showErrorToast('文件保存失败，请检查文件权限后重试');
      }
    } else {
      showErrorToast('请先打开或创建文件以保存到磁盘');
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const shortcuts = settings.shortcuts;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (matchShortcut(event, shortcuts.saveFile)) return run(handleSaveFile);
      if ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'P') && !event.shiftKey && !event.altKey) {
        return run(() => setIsQuickOpenVisible(true));
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'h' || event.key === 'H') && !event.shiftKey && !event.altKey) {
        return run(() => setIsFindReplaceOpen(true));
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'i' || event.key === 'I') && !event.altKey) {
        return run(() => setIsKnowledgeSourceOpen(true));
      }
      if (matchShortcut(event, shortcuts.newFile)) return run(handleNewFile);
      if (matchShortcut(event, shortcuts.openFile)) return run(() => void handleOpenFile());
      if (matchShortcut(event, shortcuts.openPreferences)) return run(() => setIsSettingsOpen(true));
      if (matchShortcut(event, shortcuts.toggleSidebar)) return run(() => setLeftPanelOpen((prev) => !prev));
      if (matchShortcut(event, shortcuts.toggleSourceMode)) {
        return run(() => setViewMode((prev) => (prev === 'source' ? 'wysiwyg' : 'source')));
      }
      if (matchShortcut(event, shortcuts.toggleFocusMode)) {
        return run(() => updateSettings({ focusMode: !settings.focusMode }));
      }
      if (matchShortcut(event, shortcuts.toggleTypewriterMode)) {
        return run(() => updateSettings({ typewriterMode: !settings.typewriterMode }));
      }
      if (matchShortcut(event, shortcuts.toggleToolbar)) {
        return run(() => setIsToolbarVisible((prev) => !prev));
      }
      if (matchShortcut(event, shortcuts.toggleFullscreen)) return run(handleToggleFullscreen);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, activeFileHandle, settings.shortcuts, settings.focusMode, settings.typewriterMode]);

  const handleOpenFile = async () => {
    const result = await openFile() as any;
    if (result) {
      if (autoSaveTimerRef.current !== null) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      isFileSwitchingRef.current = true;
      try {
        activeFileHandleRef.current = result.fileHandle;
        activeWorkspaceFilePathRef.current = null;
        setActiveFileHandle(result.fileHandle);
        setActiveWorkspaceFilePath(null);
        syncDocumentContent(result.content);
        storeRecentFile(result.name, result.fileHandle);
      } finally {
        isFileSwitchingRef.current = false;
      }
    }
  };

  const handleOpenDirectory = async () => {
    const result = await openDirectory();
    if (!result) {
      const error = getLastOpenDirectoryError();
      if (error) {
        showErrorToast(`打开工作区失败：${error}`);
      }
      return;
    }

    setWorkspaceName(result.name);
    setWorkspaceDirectoryHandle(result.directoryHandle);
    setWorkspaceEntries(result.entries);
    setWorkspaceWritable(result.writable);
    setActiveWorkspaceFilePath(null);

    if (result.source === 'file-system-access' && result.directoryHandle) {
      void saveWorkspaceHandle(result.directoryHandle);
    } else {
      void clearWorkspaceHandle();
    }
  };

  const handleOpenWorkspaceFile = async (entry: WorkspaceFileEntry) => {
    const targetHandle = entry.handle ?? entry.file;

    // Immediately cancel any pending timers from previous document
    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (pendingUpdateTimerRef.current !== null) {
      clearTimeout(pendingUpdateTimerRef.current);
      pendingUpdateTimerRef.current = null;
    }
    isFileSwitchingRef.current = true;

    try {
      const fileContent = await readFile(targetHandle);
      activeFileHandleRef.current = targetHandle;
      activeWorkspaceFilePathRef.current = entry.path;
      setActiveFileHandle(targetHandle);
      setActiveWorkspaceFilePath(entry.path);
      syncDocumentContent(fileContent);
      workspaceContentCacheRef.current.set(entry.path, fileContent);
      storeRecentFile(entry.name, targetHandle);
      return true;
    } catch (error) {
      console.error('Error opening workspace file:', error);
      showErrorToast('未能打开工作区文件，请检查文件权限后重试');
      return false;
    } finally {
      isFileSwitchingRef.current = false;
    }
  };

  const handleOpenRecentFile = async (file: RecentFile) => {
    if (!file.handle) {
      showErrorToast('最近文件记录不包含可重新打开的文件句柄，请重新打开文件');
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (pendingUpdateTimerRef.current !== null) {
      clearTimeout(pendingUpdateTimerRef.current);
      pendingUpdateTimerRef.current = null;
    }
    isFileSwitchingRef.current = true;

    try {
      const fileContent = await readFile(file.handle);
      activeFileHandleRef.current = file.handle;
      activeWorkspaceFilePathRef.current = null;
      setActiveFileHandle(file.handle);
      setActiveWorkspaceFilePath(null);
      syncDocumentContent(fileContent);
      storeRecentFile(file.name, file.handle);
    } catch (error) {
      console.error('Error opening recent file:', error);
      showErrorToast('未能重新打开最近文件，请重新选择该文件');
    } finally {
      isFileSwitchingRef.current = false;
    }
  };

  const resolveWorkspaceDirectoryHandle = async (directoryPath: string | null) => {
    if (!workspaceDirectoryHandle) {
      return null;
    }
    if (!directoryPath) {
      return workspaceDirectoryHandle;
    }
    if (typeof workspaceDirectoryHandle.getDirectoryHandle !== 'function') {
      return null;
    }
    let currentHandle = workspaceDirectoryHandle;
    const segments = directoryPath.split('/').filter(Boolean);
    for (const segment of segments) {
      currentHandle = await currentHandle.getDirectoryHandle(segment);
    }
    return currentHandle;
  };

  const getTargetDirectoryPath = (entry: WorkspaceEntry) =>
    entry.kind === 'directory' ? entry.path : getWorkspaceParentPath(entry.path);
  const createWorkspaceFileAt = async (
    directoryPath: string | null,
    fileNameInput?: string,
    fileContentInput?: string
  ) => {
    if (!workspaceName) {
      showErrorToast('\u8bf7\u5148\u6253\u5f00\u5de5\u4f5c\u533a\u540e\u518d\u65b0\u5efa\u6587\u4ef6');
      return false;
    }

    if (!workspaceWritable || !workspaceDirectoryHandle) {
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u4e3a\u53ea\u8bfb\u6a21\u5f0f\uff0c\u4e0d\u652f\u6301\u65b0\u5efa\u6587\u4ef6');
      return false;
    }

    try {
      const targetEntries = getWorkspaceEntriesForDirectory(workspaceEntries, directoryPath);
      const fileName = fileNameInput
        ? normalizeWorkspaceFileName(fileNameInput)
        : getNextWorkspaceFileName(targetEntries);
      if (!fileName) {
        showErrorToast('\u6587\u4ef6\u540d\u4e0d\u5408\u6cd5\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165');
        return false;
      }
      const hasDuplicate = targetEntries.some((item) => item.name.toLowerCase() === fileName.toLowerCase());
      if (hasDuplicate) {
        showErrorToast('\u76ee\u6807\u6587\u4ef6\u540d\u5df2\u5b58\u5728');
        return false;
      }

      const fileContent = typeof fileContentInput === 'string' ? fileContentInput : initialContent;

      if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
        const createdPath = buildWorkspacePath(directoryPath, fileName);
        await writeNativeWorkspaceFile(workspaceDirectoryHandle.workspaceId, createdPath, fileContent);
        const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
        const createdEntry = findWorkspaceFileEntry(nextEntries, createdPath);
        const fileHandle = createNativeWorkspaceFileHandle(
          workspaceDirectoryHandle.workspaceId,
          createdEntry?.path ?? createdPath,
          fileName
        );

        setActiveFileHandle(fileHandle);
        setActiveWorkspaceFilePath(createdEntry?.path ?? createdPath);
        syncDocumentContent(fileContent);
        storeRecentFile(fileName, fileHandle);
        workspaceContentCacheRef.current.set(createdEntry?.path ?? createdPath, fileContent);
        return true;
      }

      const targetHandle = await resolveWorkspaceDirectoryHandle(directoryPath);
      if (!targetHandle || typeof targetHandle.getFileHandle !== 'function') {
        showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u65e0\u6cd5\u5199\u5165\u5230\u76ee\u6807\u76ee\u5f55');
        return false;
      }
      const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
      await writeFile(fileHandle, fileContent);

      const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
      const createdPath = buildWorkspacePath(directoryPath, fileName);
      const createdEntry = findWorkspaceFileEntry(nextEntries, createdPath);

      setActiveFileHandle(fileHandle);
      setActiveWorkspaceFilePath(createdEntry?.path ?? createdPath);
      syncDocumentContent(fileContent);
      storeRecentFile(fileName, fileHandle);
      workspaceContentCacheRef.current.set(createdEntry?.path ?? createdPath, fileContent);
      return true;
    } catch (error) {
      console.error('Error creating workspace file:', error);
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u672a\u80fd\u5b8c\u6210\u65b0\u5efa\u6587\u4ef6\uff0c\u8bf7\u68c0\u67e5\u6d4f\u89c8\u5668\u6587\u4ef6\u5939\u6743\u9650\u540e\u91cd\u8bd5');
      return false;
    }
  };

  const createWorkspaceFolderAt = async (directoryPath: string | null, folderNameInput?: string) => {
    if (!workspaceName) {
      showErrorToast('\u8bf7\u5148\u6253\u5f00\u5de5\u4f5c\u533a\u540e\u518d\u65b0\u5efa\u6587\u4ef6\u5939');
      return false;
    }

    if (!workspaceWritable || !workspaceDirectoryHandle) {
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u4e3a\u53ea\u8bfb\u6a21\u5f0f\uff0c\u4e0d\u652f\u6301\u65b0\u5efa\u6587\u4ef6\u5939');
      return false;
    }

    try {
      const targetEntries = getWorkspaceEntriesForDirectory(workspaceEntries, directoryPath);
      const folderName = folderNameInput
        ? normalizeWorkspaceFolderName(folderNameInput)
        : getNextWorkspaceFolderName(targetEntries);
      if (!folderName) {
        showErrorToast('\u6587\u4ef6\u5939\u540d\u4e0d\u5408\u6cd5\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165');
        return false;
      }
      const hasDuplicate = targetEntries.some((item) => item.name.toLowerCase() === folderName.toLowerCase());
      if (hasDuplicate) {
        showErrorToast('\u76ee\u6807\u6587\u4ef6\u5939\u5df2\u5b58\u5728');
        return false;
      }

      if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
        await createNativeWorkspaceDirectory(
          workspaceDirectoryHandle.workspaceId,
          buildWorkspacePath(directoryPath, folderName)
        );
        await refreshWorkspace(workspaceDirectoryHandle);
        return true;
      }

      const targetHandle = await resolveWorkspaceDirectoryHandle(directoryPath);
      if (!targetHandle || typeof targetHandle.getDirectoryHandle !== 'function') {
        showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u65e0\u6cd5\u5199\u5165\u5230\u76ee\u6807\u76ee\u5f55');
        return false;
      }
      await targetHandle.getDirectoryHandle(folderName, { create: true });
      await refreshWorkspace(workspaceDirectoryHandle);
      return true;
    } catch (error) {
      console.error('Error creating workspace folder:', error);
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u672a\u80fd\u5b8c\u6210\u65b0\u5efa\u6587\u4ef6\u5939\uff0c\u8bf7\u68c0\u67e5\u6d4f\u89c8\u5668\u6587\u4ef6\u5939\u6743\u9650\u540e\u91cd\u8bd5');
      return false;
    }
  };
  const handleCreateWorkspaceFile = async (directoryPath: unknown = null, fileNameInput?: string) => {
    return await createWorkspaceFileAt(typeof directoryPath === 'string' ? directoryPath : null, fileNameInput);
  };

  const handleCreateClippedWorkspaceFile = async (fileName: string, fileContent: string): Promise<boolean> => {
    if (workspaceDirectoryHandle && workspaceWritable) {
      return await createWorkspaceFileAt(null, fileName, fileContent);
    }
    syncDocumentContent(fileContent);
    setActiveFileHandle(null);
    setActiveWorkspaceFilePath(null);
    showToast(`已成功载入剪藏内容: ${fileName}`, 'info');
    return true;
  };

  const handleInsertClippedContent = (markdown: string) => {
    if (editor) {
      editor.chain().focus().insertContent(markdown).run();
      showToast('已成功插入到当前文档', 'info');
    } else {
      syncDocumentContent(content + '\n\n' + markdown);
      showToast('已追加到当前文档末尾', 'info');
    }
  };

  const handleCreateWorkspaceFolder = async (directoryPath: unknown = null, folderNameInput?: string) => {
    return await createWorkspaceFolderAt(typeof directoryPath === 'string' ? directoryPath : null, folderNameInput);
  };

  const handleWorkspaceEntryCreateFile = async (entry: WorkspaceEntry, fileNameInput?: string) => {
    return await createWorkspaceFileAt(getTargetDirectoryPath(entry), fileNameInput);
  };

  const handleWorkspaceEntryCreateFolder = async (entry: WorkspaceEntry, folderNameInput?: string) => {
    return await createWorkspaceFolderAt(getTargetDirectoryPath(entry), folderNameInput);
  };

  const handleWorkspaceEntryRename = async (entry: WorkspaceFileEntry, nextNameInput?: string) => {
    if (!workspaceName) {
      showErrorToast('\u8bf7\u5148\u6253\u5f00\u5de5\u4f5c\u533a\u540e\u518d\u91cd\u547d\u540d\u6587\u4ef6');
      return false;
    }

    if (!workspaceWritable || !workspaceDirectoryHandle) {
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u4e3a\u53ea\u8bfb\u6a21\u5f0f\uff0c\u4e0d\u652f\u6301\u91cd\u547d\u540d\u6587\u4ef6');
      return false;
    }

    if (typeof nextNameInput !== 'string') {
      showWarningToast('\u8bf7\u5728\u4fa7\u8fb9\u680f\u76f4\u63a5\u4fee\u6539\u6587\u4ef6\u540d');
      return false;
    }

    const nextName = normalizeWorkspaceFileName(nextNameInput);
    if (!nextName) {
      showErrorToast('\u6587\u4ef6\u540d\u4e0d\u5408\u6cd5\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165');
      return false;
    }

    if (nextName === entry.name) {
      return true;
    }

    const parentPath = getWorkspaceParentPath(entry.path);
    const siblingEntries = getWorkspaceEntriesForDirectory(workspaceEntries, parentPath);
    const hasDuplicate = siblingEntries.some((item) => item.name.toLowerCase() === nextName.toLowerCase());
    if (hasDuplicate) {
      showErrorToast('\u76ee\u6807\u6587\u4ef6\u540d\u5df2\u5b58\u5728');
      return false;
    }

    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      try {
        const nextPath = buildWorkspacePath(parentPath, nextName);
        const cachedContent = workspaceContentCacheRef.current.get(entry.path);
        await renameNativeWorkspaceEntry(workspaceDirectoryHandle.workspaceId, entry.path, nextPath);
        const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
        const nextEntry = findWorkspaceFileEntry(nextEntries, nextPath);
        const nextResolvedPath = nextEntry?.path ?? nextPath;
        const nextHandle = createNativeWorkspaceFileHandle(
          workspaceDirectoryHandle.workspaceId,
          nextResolvedPath,
          nextName
        );

        workspaceContentCacheRef.current.delete(entry.path);
        if (activeWorkspaceFilePath === entry.path) {
          workspaceContentCacheRef.current.set(nextResolvedPath, content);
          setActiveWorkspaceFilePath(nextResolvedPath);
          setActiveFileHandle(nextHandle);
        } else if (typeof cachedContent === 'string') {
          workspaceContentCacheRef.current.set(nextResolvedPath, cachedContent);
        }

        storeRecentFile(nextName, nextHandle);
        return true;
      } catch (error) {
        console.error('Error renaming native workspace file:', error);
        showErrorToast('\u91cd\u547d\u540d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u6743\u9650\u540e\u91cd\u8bd5');
        return false;
      }
    }

    const parentHandle = await resolveWorkspaceDirectoryHandle(parentPath);
    if (!parentHandle || typeof parentHandle.getFileHandle !== 'function' || typeof parentHandle.removeEntry !== 'function') {
      showErrorToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u91cd\u547d\u540d\u6587\u4ef6');
      return false;
    }

    try {
      const sourceHandle = entry.handle ?? entry.file;
      const fileContent = entry.path === activeWorkspaceFilePath ? content : await readFile(sourceHandle);
      const nextHandle = await parentHandle.getFileHandle(nextName, { create: true });
      await writeFile(nextHandle, fileContent);
      await parentHandle.removeEntry(entry.name);

      const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
      const nextPath = buildWorkspacePath(parentPath, nextName);
      const nextEntry = findWorkspaceFileEntry(nextEntries, nextPath);

      workspaceContentCacheRef.current.delete(entry.path);
      workspaceContentCacheRef.current.set(nextPath, fileContent);

      if (activeWorkspaceFilePath === entry.path) {
        setActiveWorkspaceFilePath(nextEntry?.path ?? nextPath);
        setActiveFileHandle(nextHandle);
      }

      storeRecentFile(nextName, nextHandle);
      return true;
    } catch (error) {
      console.error('Error renaming workspace file:', error);
      showErrorToast('\u91cd\u547d\u540d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u6743\u9650\u540e\u91cd\u8bd5');
      return false;
    }
  };

  const handleWorkspaceEntryDelete = async (entry: WorkspaceEntry) => {
    if (!workspaceName) {
      showErrorToast('\u8bf7\u5148\u6253\u5f00\u5de5\u4f5c\u533a\u540e\u518d\u5220\u9664');
      return false;
    }

    if (!workspaceWritable || !workspaceDirectoryHandle) {
      showErrorToast('\u5f53\u524d\u5de5\u4f5c\u533a\u4e3a\u53ea\u8bfb\u6a21\u5f0f\uff0c\u65e0\u6cd5\u5220\u9664\u6587\u4ef6\u6216\u6587\u4ef6\u5939');
      return false;
    }

    const parentPath = getWorkspaceParentPath(entry.path);
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      try {
        await deleteNativeWorkspaceEntry(workspaceDirectoryHandle.workspaceId, entry.path);

        const cache = workspaceContentCacheRef.current;
        if (entry.kind === 'file') {
          cache.delete(entry.path);
        } else {
          for (const key of Array.from(cache.keys())) {
            if (key === entry.path || key.startsWith(`${entry.path}/`)) {
              cache.delete(key);
            }
          }
        }

        if (
          activeWorkspaceFilePath &&
          (activeWorkspaceFilePath === entry.path || activeWorkspaceFilePath.startsWith(`${entry.path}/`))
        ) {
          setActiveWorkspaceFilePath(null);
          setActiveFileHandle(null);
          syncDocumentContent(initialContent);
        }

        await refreshWorkspace(workspaceDirectoryHandle);
        return true;
      } catch (error) {
        console.error('Error deleting native workspace entry:', error);
        showErrorToast('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u6743\u9650\u540e\u91cd\u8bd5');
        return false;
      }
    }

    const parentHandle = await resolveWorkspaceDirectoryHandle(parentPath);
    if (!parentHandle || typeof parentHandle.removeEntry !== 'function') {
      showWarningToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5220\u9664\u6587\u4ef6\u6216\u6587\u4ef6\u5939');
      return false;
    }

    try {
      if (entry.kind === 'directory') {
        await parentHandle.removeEntry(entry.name, { recursive: true });
      } else {
        await parentHandle.removeEntry(entry.name);
      }

      const cache = workspaceContentCacheRef.current;
      if (entry.kind === 'file') {
        cache.delete(entry.path);
      } else {
        for (const key of Array.from(cache.keys())) {
          if (key === entry.path || key.startsWith(`${entry.path}/`)) {
            cache.delete(key);
          }
        }
      }

      if (
        activeWorkspaceFilePath &&
        (activeWorkspaceFilePath === entry.path || activeWorkspaceFilePath.startsWith(`${entry.path}/`))
      ) {
        setActiveWorkspaceFilePath(null);
        setActiveFileHandle(null);
        syncDocumentContent(initialContent);
      }

      await refreshWorkspace(workspaceDirectoryHandle);
      return true;
    } catch (error) {
      console.error('Error deleting workspace entry:', error);
      showErrorToast('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u6743\u9650\u540e\u91cd\u8bd5');
      return false;
    }
  };

  const copyWorkspaceText = async (value: string) => {
    if (!navigator.clipboard?.writeText) {
      showWarningToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u590d\u5236');
      return false;
    }

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.error('Error copying workspace text:', error);
      showErrorToast('\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');
      return false;
    }
  };

  const handleWorkspaceEntryCopyName = async (entry: WorkspaceEntry) => {
    await copyWorkspaceText(entry.name);
  };

  const handleWorkspaceEntryCopyPath = async (entry: WorkspaceEntry) => {
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const rootPath = normalizePath(workspaceDirectoryHandle.rootPath).replace(/\/+$/g, '');
      await copyWorkspaceText(entry.path ? `${rootPath}/${entry.path}` : rootPath);
      return;
    }

    const candidateHandle: any = (entry as any).handle ?? (entry as any).file ?? entry;
    const candidatePaths = [
      candidateHandle?.path,
      candidateHandle?.fullPath,
      candidateHandle?.filePath,
      (entry as any).absolutePath,
      (entry as any).fullPath,
      (entry as any).path,
    ];

    const isAbsolutePath = (value: string) => /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/');
    const absolutePath = candidatePaths.find((value) => typeof value === 'string' && isAbsolutePath(value));

    if (absolutePath) {
      await copyWorkspaceText(absolutePath);
      return;
    }

    const copied = await copyWorkspaceText(entry.path);
    if (copied && !absolutePathWarningRef.current) {
      showWarningToast('\u6d4f\u89c8\u5668\u73af\u5883\u65e0\u6cd5\u83b7\u53d6\u7edd\u5bf9\u8def\u5f84\uff0c\u5df2\u590d\u5236\u5de5\u4f5c\u533a\u76f8\u5bf9\u8def\u5f84');
      absolutePathWarningRef.current = true;
    }
  };

  const handleWorkspaceEntryOpenPath = async (entry: WorkspaceEntry) => {
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      try {
        await revealNativeWorkspaceEntry(workspaceDirectoryHandle.workspaceId, entry.path);
      } catch (error) {
        console.error('Error revealing native workspace path:', error);
        showWarningToast('未能在文件管理器中显示该路径，请检查文件是否仍然存在');
      }
      return;
    }

    if (window.self !== window.top || typeof (window as any).showDirectoryPicker !== 'function') {
      showWarningToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u6253\u5f00\u8def\u5f84');
      return;
    }

    const targetPath = entry.kind === 'directory' ? entry.path : getWorkspaceParentPath(entry.path);
    const targetHandle = await resolveWorkspaceDirectoryHandle(targetPath);
    if (!targetHandle) {
      showWarningToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u6253\u5f00\u8def\u5f84');
      return;
    }

    try {
      await (window as any).showDirectoryPicker({ startIn: targetHandle });
    } catch (error) {
      if ((error as DOMException | undefined)?.name === 'AbortError') {
        return;
      }
      console.error('Error opening workspace path:', error);
      showWarningToast('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u6253\u5f00\u8def\u5f84');
    }
  };

  const handleNewFile = () => {
    setActiveWorkspaceFilePath(null);
    setActiveFileHandle(null);
    syncDocumentContent(initialContent);
    showToast('已创建新文件');
  };

  const handleSearch = (query: string) => {
    const normalizedQuery = query.trim();
    setSearchQuery(normalizedQuery);
    setSearchVersion((currentVersion) => currentVersion + 1);
    if (!normalizedQuery) {
      setSearchMatchCount(0);
      setSearchActiveMatchIndex(0);
    }
  };

  const handleSearchNavigate = (direction: 'next' | 'prev') => {
    if (!searchQuery.trim() || searchMatchCount === 0) {
      return;
    }

    setSearchNavigation((prev) => ({
      direction,
      token: (prev?.token ?? 0) + 1,
    }));
  };

  const handleSearchOptionsChange = (partial: Partial<typeof searchOptions>) => {
    setSearchOptions((prev) => ({ ...prev, ...partial }));
    if (searchQuery.trim()) {
      setSearchVersion((currentVersion) => currentVersion + 1);
    }
  };

  const handleWorkspaceSearchChange = (query: string) => {
    setWorkspaceSearchQuery(query);
  };

  const handleWorkspaceSearchOptionsChange = (partial: Partial<typeof workspaceSearchOptions>) => {
    setWorkspaceSearchOptions((prev) => ({ ...prev, ...partial }));
  };

  const handleWorkspaceSearchMatchClick = async (entry: WorkspaceFileEntry, match: WorkspaceSearchMatch) => {
    const opened = await handleOpenWorkspaceFile(entry);
    if (!opened) {
      return;
    }

    const query = workspaceSearchQuery.trim();
    if (!query) {
      return;
    }

    setSearchOptions({
      caseSensitive: workspaceSearchOptions.caseSensitive,
      wholeWord: workspaceSearchOptions.wholeWord,
    });
    setSearchQuery(query);
    setSearchVersion((currentVersion) => currentVersion + 1);
    setSearchJump((prev) => ({ index: match.matchIndex, token: (prev?.token ?? 0) + 1 }));
  };


  const handleToggleFullscreen = () => {
    if (isFullscreen) {
      const previousPanelState = fullscreenPanelStateRef.current;
      if (previousPanelState) {
        setLeftPanelOpen(previousPanelState.leftPanelOpen);
        setAiPanelOpen(previousPanelState.aiPanelOpen);
      }
      fullscreenPanelStateRef.current = null;
      setIsFullscreen(false);
    } else {
      fullscreenPanelStateRef.current = { leftPanelOpen, aiPanelOpen };
      setLeftPanelOpen(false);
      setAiPanelOpen(false);
      setIsFullscreen(true);
    }
  };

  const handleToggleFocusMode = () => {
    updateSettings({ focusMode: !settings.focusMode });
  };

  const handleWindowMinimize = () => {
    nativeClient.minimizeWindow().catch((error) => {
      console.error('Error minimizing native window:', error);
    });
  };

  const handleWindowToggleMaximize = () => {
    nativeClient.toggleMaximizeWindow().catch((error) => {
      console.error('Error toggling native window maximize state:', error);
    });
  };

  const handleWindowClose = () => {
    nativeClient.closeWindow().catch((error) => {
      console.error('Error closing native window:', error);
    });
  };

  const handleWindowStartDrag = () => {
    nativeClient.startWindowDrag().catch((error) => {
      console.error('Error starting native window drag:', error);
    });
  };

  const lastKnownMtimeRef = useRef<number>(0);
  const [externalModifiedPath, setExternalModifiedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const currentHandle = activeFileHandle;
    const filePath = (currentHandle as any)?.path;
    if (!filePath) {
      setExternalModifiedPath(null);
      return;
    }

    getNativeFileMtime(filePath).then((mtime) => {
      lastKnownMtimeRef.current = mtime;
    }).catch(() => {});

    const checkExternalChange = async () => {
      try {
        const mtime = await getNativeFileMtime(filePath);
        if (lastKnownMtimeRef.current > 0 && mtime > lastKnownMtimeRef.current) {
          const diskContent = await readNativeFile(filePath);
          if (diskContent !== contentRef.current) {
            setExternalModifiedPath(filePath);
          } else {
            lastKnownMtimeRef.current = mtime;
          }
        }
      } catch {
        // file may be momentarily locked
      }
    };

    const interval = setInterval(checkExternalChange, 3000);
    const onFocus = () => { void checkExternalChange(); };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeFileHandle]);

  const handleReloadExternalFile = async () => {
    if (!externalModifiedPath) return;
    try {
      const diskContent = await readNativeFile(externalModifiedPath);
      contentRef.current = diskContent;
      setContent(diskContent);
      editor?.commands?.setContent(diskContent);
      const mtime = await getNativeFileMtime(externalModifiedPath);
      lastKnownMtimeRef.current = mtime;
      lastSavedContentRef.current = diskContent;
      setExternalModifiedPath(null);
      showToast('已从磁盘重新载入外部修改的内容', 'info');
    } catch (err) {
      showErrorToast('重新载入文件失败，请检查文件权限');
    }
  };

  const handleDismissExternalFile = async () => {
    if (!externalModifiedPath) return;
    try {
      const mtime = await getNativeFileMtime(externalModifiedPath);
      lastKnownMtimeRef.current = mtime;
    } catch {}
    setExternalModifiedPath(null);
    showToast('已保留当前编辑器中的内容', 'info');
  };

  const workspaceNotice = workspaceName && !workspaceWritable
    ? '当前工作区为只读模式，仅支持浏览和打开已有 Markdown 文件，不支持新建文件或文件夹。'
    : null;

  const getActiveDocKey = () => {
    return activeWorkspaceFilePathRef.current || (activeFileHandleRef.current as any)?.path || (activeFileHandleRef.current as any)?.name || 'current_doc';
  };

  const handleRestoreFromTimeline = (restoredContent: string) => {
    contentRef.current = restoredContent;
    setContent(restoredContent);
    editor?.commands?.setContent(restoredContent);
  };

  return (
    <div className={cn(
      "app-shell flex h-screen w-full flex-col bg-slate-50 dark:bg-dark-bg text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200",
      settings.focusMode && "focus-mode",
      settings.uiDensity === 'compact' && "density-compact"
    )}>
      {externalModifiedPath && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-xs shadow-md z-[100] shrink-0 select-none">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>检测到当前打开的文件已在外部被修改，是否重新载入磁盘最新内容？</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReloadExternalFile}
              className="px-2.5 py-1 rounded bg-white text-amber-900 font-bold hover:bg-amber-50 transition-colors"
            >
              重新载入
            </button>
            <button
              onClick={handleDismissExternalFile}
              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors"
            >
              保留当前编辑
            </button>
          </div>
        </div>
      )}
      {!settings.focusMode && (
        <Header
          viewMode={viewMode}
          setViewMode={setViewMode}
          aiPanelOpen={aiPanelOpen}
          setAiPanelOpen={setAiPanelOpen}
          leftPanelOpen={leftPanelOpen}
          setLeftPanelOpen={setLeftPanelOpen}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAICenter={() => setIsAICenterOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          content={content}
          showToast={showToast}
          onSave={handleSaveFile}
          onNewFile={handleNewFile}
          onOpenFile={handleOpenFile}
          onSearch={handleSearch}
          searchOptions={searchOptions}
          searchMatchCount={searchMatchCount}
          searchActiveMatchIndex={searchActiveMatchIndex}
          onSearchNavigate={handleSearchNavigate}
          onSearchOptionsChange={handleSearchOptionsChange}
          isToolbarVisible={isToolbarVisible}
          setIsToolbarVisible={setIsToolbarVisible}
          onQuickOpen={() => setIsQuickOpenVisible(true)}
          onOpenReplace={() => setIsFindReplaceOpen(true)}
          onOpenManual={() => setIsManualOpen(true)}
          onOpenExportDocx={() => setIsExportDocxModalOpen(true)}
          onOpenTimeline={() => setIsTimelineOpen(true)}
          onOpenKnowledgeSource={() => setIsKnowledgeSourceOpen(true)}
          onCheckUpdate={() => void handleCheckUpdate(true)}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleFocusMode={handleToggleFocusMode}
          onWindowMinimize={handleWindowMinimize}
          onWindowToggleMaximize={handleWindowToggleMaximize}
          onWindowClose={handleWindowClose}
          onWindowStartDrag={handleWindowStartDrag}
          editor={editor}
          onInsertImage={handleInsertImageFromPicker}
        />
      )}
      {settings.focusMode && (
        <div
          aria-label="专注模式窗口拖拽区"
          data-tauri-drag-region
          onPointerDown={(event) => {
            if (event.button > 0) {
              return;
            }

            handleWindowStartDrag();
          }}
          className="print-hide fixed inset-x-0 top-0 z-50 h-2 cursor-grab active:cursor-grabbing"
        />
      )}
      <div className="flex flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {leftPanelOpen && !settings.focusMode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: leftPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: isResizingLeftPanel ? 0 : 0.2, ease: "easeInOut" }}
              className="print-hide h-full overflow-hidden relative"
              style={{ minWidth: 220, maxWidth: Math.min(520, Math.floor(window.innerWidth * 0.6)) }}
            >
              <SidebarLeft
                onOpenFile={handleOpenFile}
                onOpenWorkspace={handleOpenDirectory}
                onRefreshWorkspace={handleRefreshWorkspace}
                onCreateWorkspaceFile={handleCreateWorkspaceFile}
                onCreateWorkspaceFolder={handleCreateWorkspaceFolder}
                onOpenWorkspaceFile={handleOpenWorkspaceFile}
                onOpenRecentFile={handleOpenRecentFile}
                recentFiles={recentFiles}
                workspaceName={workspaceName}
                workspaceEntries={workspaceEntries}
                activeWorkspaceFilePath={activeWorkspaceFilePath}
                workspaceNotice={workspaceNotice}
                workspaceWritable={workspaceWritable}
                workspaceSearchQuery={workspaceSearchQuery}
                workspaceSearchOptions={workspaceSearchOptions}
                workspaceSearchResults={workspaceSearchResults}
                workspaceSearchStatus={workspaceSearchStatus}
                workspaceSearchHasFallback={workspaceSearchHasFallback}
                onWorkspaceSearchChange={handleWorkspaceSearchChange}
                onWorkspaceSearchOptionsChange={handleWorkspaceSearchOptionsChange}
                onWorkspaceSearchMatchClick={handleWorkspaceSearchMatchClick}
                onWorkspaceEntryCreateFile={handleWorkspaceEntryCreateFile}
                onWorkspaceEntryCreateFolder={handleWorkspaceEntryCreateFolder}
                onWorkspaceEntryRename={handleWorkspaceEntryRename}
                onWorkspaceEntryDelete={handleWorkspaceEntryDelete}
                onWorkspaceEntryOpenPath={handleWorkspaceEntryOpenPath}
                onWorkspaceEntryCopyName={handleWorkspaceEntryCopyName}
                onWorkspaceEntryCopyPath={handleWorkspaceEntryCopyPath}
                headings={headings}
                activeHeadingId={activeHeadingId}
                onHeadingClick={(pos) => setScrollToPos({ pos, timestamp: Date.now() })}
                onClose={() => setLeftPanelOpen(false)}
              />
              <div
                role="separator"
                aria-orientation="vertical"
                onDoubleClick={() => setLeftPanelWidth(280)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsResizingLeftPanel(true);
                }}
                className={cn(
                  "absolute -right-1.5 top-0 h-full w-3 z-40 cursor-col-resize group flex justify-center items-stretch select-none",
                  isResizingLeftPanel ? "bg-accent/20" : "bg-transparent hover:bg-accent/20"
                )}
                title="拖拽调整侧边栏宽度，双击还原"
              >
                <div
                  className={cn(
                    "w-0.5 h-full transition-colors",
                    isResizingLeftPanel ? "bg-accent" : "group-hover:bg-accent/80"
                  )}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Expand Button when sidebar is closed */}
        {!leftPanelOpen && !settings.focusMode && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setLeftPanelOpen(true)}
            className="print-hide absolute left-0 top-1/2 -translate-y-1/2 z-40 p-1.5 bg-white dark:bg-[#18181B] border border-l-0 border-slate-200 dark:border-[#27272A] rounded-r-md text-slate-400 hover:text-accent shadow-md transition-all group"
            title="展开侧边栏"
          >
            <span className="text-base font-semibold leading-none transition-transform group-hover:scale-110">&gt;</span>
          </motion.button>
        )}

        <Editor
          content={content}
          setContent={setContent}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          isToolbarVisible={isToolbarVisible}
          setIsToolbarVisible={setIsToolbarVisible}
          searchQuery={searchQuery}
          searchVersion={searchVersion}
          searchOptions={searchOptions}
          searchNavigation={searchNavigation}
          searchJump={searchJump}
          onSearchMatchCount={(count) => {
            setSearchMatchCount(count);
            if (count === 0) {
              setSearchActiveMatchIndex(0);
            }
          }}
          onSearchActiveMatchIndex={setSearchActiveMatchIndex}
          onHeadingsChange={setHeadings}
          scrollToPos={scrollToPos}
          editor={editor}
          onInsertImage={handleInsertImageFromPicker}
          onSaveImageFile={saveImageToWorkspace}
          onSelectionChange={setSelectedText}
          documentId={documentId}
          showToast={showToast}
          onActiveHeadingChange={setActiveHeadingId}
        />
        {aiPanelOpen && !settings.focusMode && (
          <div
            className="print-hide h-full relative shrink-0"
            style={{ width: aiPanelWidth, minWidth: 300, maxWidth: '55vw' }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              onDoubleClick={() => {
                setAiPanelWidth(390);
                try {
                  localStorage.setItem('lumina-ai-panel-width', '390');
                } catch {}
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizingAiPanel(true);
              }}
              className={cn(
                "absolute -left-1.5 top-0 h-full w-3.5 z-40 cursor-col-resize group flex justify-center items-stretch select-none",
                isResizingAiPanel ? "bg-accent/20" : "bg-transparent hover:bg-accent/20"
              )}
              title="拖拽调整 AI 助理宽度，双击还原 (390px)"
            >
              <div
                className={cn(
                  "w-0.5 h-full transition-colors",
                  isResizingAiPanel ? "bg-accent" : "group-hover:bg-accent/80"
                )}
              />
            </div>
            <SidebarRight
              content={content}
              setContent={applyDocumentContentEdit}
              onInsertAtEnd={appendDocumentContentAtEnd}
              onClose={() => setAiPanelOpen(false)}
              showToast={showToast}
              selectedText={selectedText}
              documentId={documentId}
              onOpenAICenter={() => setIsAICenterOpen(true)}
              onRetrieveWorkspaceContext={buildWorkspaceDocContext}
              onPersistGeneratedAssets={persistGeneratedAIAssets}
            />
          </div>
        )}
      </div>
      {!settings.focusMode && (
        <Footer
          content={content}
          showToast={showToast}
          onOpenTimeline={() => setIsTimelineOpen(true)}
        />
      )}

      <React.Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onCheckUpdate={() => void handleCheckUpdate(true)}
          />
        )}
        {isAICenterOpen && (
          <AICenterModal isOpen={isAICenterOpen} onClose={() => setIsAICenterOpen(false)} />
        )}
        {isAboutOpen && (
          <AboutModal
            isOpen={isAboutOpen}
            onClose={() => setIsAboutOpen(false)}
            onOpenManual={() => setIsManualOpen(true)}
            onCheckUpdate={() => void handleCheckUpdate(true)}
          />
        )}
        {isUpdateModalOpen && (
          <UpdateModal
            isOpen={isUpdateModalOpen}
            onClose={() => setIsUpdateModalOpen(false)}
            release={latestReleaseInfo}
            showToast={showToast}
          />
        )}
        {isManualOpen && (
          <UserManualModal
            isOpen={isManualOpen}
            onClose={() => setIsManualOpen(false)}
          />
        )}
        {isKnowledgeSourceOpen && (
          <KnowledgeSourceModal
            isOpen={isKnowledgeSourceOpen}
            onClose={() => setIsKnowledgeSourceOpen(false)}
            showToast={showToast}
            onInsertAtCursor={handleInsertClippedContent}
            onCreateWorkspaceDocument={handleCreateClippedWorkspaceFile}
            workspaceId={
              isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)
                ? workspaceDirectoryHandle.workspaceId
                : undefined
            }
            documentFilePath={activeFileHandle?.path}
            hasActiveWorkspace={Boolean(workspaceName && workspaceWritable)}
          />
        )}
        {isExportDocxModalOpen && (
          <ExportModal
            isOpen={isExportDocxModalOpen}
            onClose={() => setIsExportDocxModalOpen(false)}
            content={content}
            showToast={showToast}
          />
        )}
        {isTimelineOpen && (
          <TimelineModal
            isOpen={isTimelineOpen}
            onClose={() => setIsTimelineOpen(false)}
            docKey={getActiveDocKey()}
            currentContent={content}
            onRestoreContent={handleRestoreFromTimeline}
            showToast={showToast}
          />
        )}
        {isQuickOpenVisible && (
          <QuickOpenModal
            isOpen={isQuickOpenVisible}
            onClose={() => setIsQuickOpenVisible(false)}
            workspaceEntries={workspaceEntries}
            recentFiles={recentFiles}
            onOpenWorkspaceFile={handleOpenWorkspaceFile}
            onOpenRecentFile={handleOpenRecentFile}
          />
        )}
        {isFindReplaceOpen && (
          <FindReplaceModal
            isOpen={isFindReplaceOpen}
            onClose={() => setIsFindReplaceOpen(false)}
            editor={editor}
            showToast={showToast}
          />
        )}
      </React.Suspense>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            style={{ backgroundColor: 'var(--accent)' }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 text-white px-4 py-2 rounded-full toast-shadow text-sm font-medium z-50 transition-colors duration-200"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <AIProvider>
          <AppContent />
        </AIProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

















