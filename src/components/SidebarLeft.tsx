import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown, Plus, FolderPlus, Search, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { WorkspaceEntry, WorkspaceFileEntry } from '../lib/fileSystem';

interface RecentFile {
  name: string;
  handle?: any;
}

interface WorkspaceSearchResult {
  entry: WorkspaceFileEntry;
  matchCount: number;
  matchedBy: 'content' | 'filename';
  matches: WorkspaceSearchMatch[];
}

interface WorkspaceSearchMatch {
  line: number;
  preview: string;
  highlights: { start: number; end: number }[];
  matchIndex: number;
}

interface WorkspaceContextMenuState {
  open: boolean;
  x: number;
  y: number;
  entry: WorkspaceEntry | null;
}


type InlineEditState =
  | {
      mode: 'rename';
      entry: WorkspaceFileEntry;
      value: string;
    }
  | {
      mode: 'create';
      kind: 'file' | 'directory';
      parentPath: string | null;
      targetEntry: WorkspaceEntry | null;
      value: string;
    };
interface SidebarLeftProps {
  onOpenFile: () => void;
  onOpenWorkspace: () => void;
  onRefreshWorkspace: () => Promise<void> | void;
  onCreateWorkspaceFile: (name?: string) => Promise<boolean> | boolean | void;
  onCreateWorkspaceFolder: (name?: string) => Promise<boolean> | boolean | void;
  onOpenWorkspaceFile: (entry: WorkspaceFileEntry) => void;
  onOpenRecentFile: (file: RecentFile) => void;
  recentFiles: RecentFile[];
  workspaceName: string | null;
  workspaceEntries: WorkspaceEntry[];
  activeWorkspaceFilePath: string | null;
  workspaceNotice: string | null;
  workspaceWritable: boolean;
  workspaceSearchQuery: string;
  workspaceSearchOptions: { caseSensitive: boolean; wholeWord: boolean };
  workspaceSearchResults: WorkspaceSearchResult[];
  workspaceSearchStatus: 'idle' | 'searching' | 'done';
  workspaceSearchHasFallback: boolean;
  onWorkspaceSearchChange: (query: string) => void;
  onWorkspaceSearchOptionsChange: (partial: { caseSensitive?: boolean; wholeWord?: boolean }) => void;
  onWorkspaceSearchMatchClick?: (entry: WorkspaceFileEntry, match: WorkspaceSearchMatch) => void;
  onWorkspaceEntryCreateFile: (entry: WorkspaceEntry, name?: string) => Promise<boolean> | boolean | void;
  onWorkspaceEntryCreateFolder: (entry: WorkspaceEntry, name?: string) => Promise<boolean> | boolean | void;
  onWorkspaceEntryRename: (entry: WorkspaceFileEntry, name: string) => Promise<boolean> | boolean | void;
  onWorkspaceEntryDelete: (entry: WorkspaceEntry) => Promise<boolean> | boolean | void;
  onWorkspaceEntryOpenPath: (entry: WorkspaceEntry) => void;
  onWorkspaceEntryCopyName: (entry: WorkspaceEntry) => void;
  onWorkspaceEntryCopyPath: (entry: WorkspaceEntry) => void;
  headings?: { level: number; text: string; id: string; pos?: number }[];
  onHeadingClick?: (pos: number) => void;
  activeHeadingId?: string | null;
  onClose: () => void;
}

function WorkspaceTree({
  entries,
  activeWorkspaceFilePath,
  onOpenWorkspaceFile,
  onEntryContextMenu,
  contextTargetPath,
  inlineEdit,
  inlineEditInputRef,
  onInlineEditChange,
  onInlineEditCommit,
  onInlineEditCancel,
  expandedDirectoryPaths,
  onToggleDirectory,
  currentPath = null,
  depth = 0,
}: {
  entries: WorkspaceEntry[];
  activeWorkspaceFilePath: string | null;
  onOpenWorkspaceFile: (entry: WorkspaceFileEntry) => void;
  onEntryContextMenu: (event: React.MouseEvent, entry: WorkspaceEntry) => void;
  contextTargetPath: string | null;
  inlineEdit: InlineEditState | null;
  inlineEditInputRef: React.RefObject<HTMLInputElement>;
  onInlineEditChange: (value: string) => void;
  onInlineEditCommit: () => void;
  onInlineEditCancel: () => void;
  expandedDirectoryPaths: Record<string, boolean>;
  onToggleDirectory: (path: string) => void;
  currentPath?: string | null;
  depth?: number;
}) {
  const showDraftHere = inlineEdit?.mode === 'create' && inlineEdit.parentPath === currentPath;

  const renderInlineInput = (kind: 'file' | 'directory', ariaLabel: string) => (
    <div
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
        'bg-slate-200/70 text-slate-700 dark:bg-[#27272A] dark:text-slate-200'
      )}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {kind === 'file' ? (
        <FileText size={14} className="shrink-0" />
      ) : (
        <FolderOpen size={14} className="text-accent shrink-0" />
      )}
      <input
        ref={inlineEditInputRef}
        value={inlineEdit?.value ?? ''}
        onChange={(event) => onInlineEditChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onInlineEditCommit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onInlineEditCancel();
          }
        }}
        onBlur={() => onInlineEditCommit()}
        className="min-w-0 flex-1 rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
        aria-label={ariaLabel}
      />
    </div>
  );

  return (
    <div className={cn(depth > 0 && 'ml-4 pl-2 border-l border-slate-200 dark:border-[#27272A]')}>
      {showDraftHere ? renderInlineInput(inlineEdit!.kind, inlineEdit!.kind === 'file' ? '\u65b0\u5efa\u6587\u4ef6' : '\u65b0\u5efa\u6587\u4ef6\u5939') : null}
      {entries.map((entry) => {
        if (entry.kind === 'directory') {
          const isContextTarget = contextTargetPath === entry.path;
          const forceOpenForDraft = inlineEdit?.mode === 'create' && inlineEdit.parentPath === entry.path;
          const hasNestedContent = entry.children.length > 0 || forceOpenForDraft;
          const isOpen = hasNestedContent && (forceOpenForDraft || Boolean(expandedDirectoryPaths[entry.path]));
          return (
            <div key={entry.path} className="space-y-0.5">
              <button
                type="button"
                aria-expanded={hasNestedContent ? isOpen : undefined}
                onClick={() => {
                  if (hasNestedContent) {
                    onToggleDirectory(entry.path);
                  }
                }}
                onContextMenu={(event) => onEntryContextMenu(event, entry)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md text-left transition-colors',
                  isContextTarget
                    ? 'bg-slate-200/70 text-slate-700 dark:bg-[#27272A] dark:text-slate-200'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]/50'
                )}
              >
                <ChevronRight
                  size={14}
                  className={cn(
                    'shrink-0 text-slate-400 transition-transform',
                    hasNestedContent ? 'opacity-100' : 'opacity-0',
                    isOpen && 'rotate-90'
                  )}
                />
                <FolderOpen size={14} className="text-accent shrink-0" />
                <span className="truncate">{entry.name}</span>
              </button>
              {isOpen ? (
                <WorkspaceTree
                  entries={entry.children}
                  activeWorkspaceFilePath={activeWorkspaceFilePath}
                  onOpenWorkspaceFile={onOpenWorkspaceFile}
                  onEntryContextMenu={onEntryContextMenu}
                  contextTargetPath={contextTargetPath}
                  inlineEdit={inlineEdit}
                  inlineEditInputRef={inlineEditInputRef}
                  onInlineEditChange={onInlineEditChange}
                  onInlineEditCommit={onInlineEditCommit}
                  onInlineEditCancel={onInlineEditCancel}
                  expandedDirectoryPaths={expandedDirectoryPaths}
                  onToggleDirectory={onToggleDirectory}
                  currentPath={entry.path}
                  depth={depth + 1}
                />
              ) : null}
            </div>
          );
        }

        const isActive = activeWorkspaceFilePath === entry.path;
        const isContextTarget = contextTargetPath === entry.path;
        const isEditing = inlineEdit?.mode === 'rename' && inlineEdit.entry.path === entry.path;

        if (isEditing) {
          return (
            <div key={entry.path}>
              {renderInlineInput('file', '\u91cd\u547d\u540d\u6587\u4ef6')}
            </div>
          );
        }

        return (
          <button
            key={entry.path}
            onClick={() => onOpenWorkspaceFile(entry)}
            onContextMenu={(event) => onEntryContextMenu(event, entry)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : isContextTarget
                  ? 'bg-slate-200/70 text-slate-700 dark:bg-[#27272A] dark:text-slate-200'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]/50'
            )}
          >
            <FileText size={14} className="shrink-0" />
            <span className={cn('truncate', isActive && 'font-medium')}>{entry.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const workspaceHighlightStyle: React.CSSProperties = {
  background: 'rgba(236, 91, 19, 0.22)',
  borderRadius: '0.25rem',
  boxShadow: '0 0 0 1px rgba(236, 91, 19, 0.18)',
};

const expandedDirectoryStoragePrefix = 'lumina-workspace-expanded-directories';
const rootExpandedStoragePrefix = 'lumina-workspace-root-expanded';

function getExpandedDirectoryStorageKey(workspaceName: string | null) {
  return workspaceName ? `${expandedDirectoryStoragePrefix}:${workspaceName}` : null;
}

function getRootExpandedStorageKey(workspaceName: string | null) {
  return workspaceName ? `${rootExpandedStoragePrefix}:${workspaceName}` : null;
}

function loadRootWorkspaceExpanded(workspaceName: string | null) {
  const storageKey = getRootExpandedStorageKey(workspaceName);
  if (!storageKey) {
    return true;
  }

  const saved = localStorage.getItem(storageKey);
  if (saved === 'false') {
    return false;
  }
  if (saved === 'true') {
    return true;
  }
  return true;
}

function saveRootWorkspaceExpanded(workspaceName: string | null, expanded: boolean) {
  const storageKey = getRootExpandedStorageKey(workspaceName);
  if (!storageKey) {
    return;
  }
  localStorage.setItem(storageKey, expanded ? 'true' : 'false');
}

function loadExpandedDirectoryPaths(workspaceName: string | null) {
  const storageKey = getExpandedDirectoryStorageKey(workspaceName);
  if (!storageKey) {
    return {};
  }

  try {
    const saved = localStorage.getItem(storageKey);
    const paths = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(paths)) {
      return {};
    }
    return paths.reduce<Record<string, boolean>>((accumulator, path) => {
      if (typeof path === 'string' && path.trim()) {
        accumulator[path] = true;
      }
      return accumulator;
    }, {});
  } catch {
    localStorage.removeItem(storageKey);
    return {};
  }
}

function saveExpandedDirectoryPaths(workspaceName: string | null, expandedPaths: Record<string, boolean>) {
  const storageKey = getExpandedDirectoryStorageKey(workspaceName);
  if (!storageKey) {
    return;
  }

  const paths = Object.keys(expandedPaths).filter((path) => expandedPaths[path]).sort();
  if (paths.length === 0) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(paths));
}

function renderHighlightedPreview(preview: string, highlights: { start: number; end: number }[]) {
  if (!highlights.length) {
    return preview;
  }

  const segments: React.ReactNode[] = [];
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  let cursor = 0;

  sorted.forEach((range, index) => {
    if (range.start > cursor) {
      segments.push(
        <span key={`text-${index}-${cursor}`}>{preview.slice(cursor, range.start)}</span>
      );
    }

      segments.push(
        <span
          key={`highlight-${index}-${range.start}`}
          className="editor-search-highlight"
          style={workspaceHighlightStyle}
        >
          {preview.slice(range.start, range.end)}
        </span>
      );

    cursor = range.end;
  });

  if (cursor < preview.length) {
    segments.push(<span key={`text-tail-${cursor}`}>{preview.slice(cursor)}</span>);
  }

  return segments;
}

function SidebarLeftComponent({
  onOpenFile,
  onOpenWorkspace,
  onRefreshWorkspace,
  onCreateWorkspaceFile,
  onCreateWorkspaceFolder,
  onOpenWorkspaceFile,
  onOpenRecentFile,
  recentFiles,
  workspaceName,
  workspaceEntries,
  activeWorkspaceFilePath,
  workspaceNotice,
  workspaceWritable,
  workspaceSearchQuery,
  workspaceSearchOptions,
  workspaceSearchResults,
  workspaceSearchStatus,
  workspaceSearchHasFallback,
  onWorkspaceSearchChange,
  onWorkspaceSearchOptionsChange,
  onWorkspaceSearchMatchClick,
  onWorkspaceEntryCreateFile,
  onWorkspaceEntryCreateFolder,
  onWorkspaceEntryRename,
  onWorkspaceEntryDelete,
  onWorkspaceEntryOpenPath,
  onWorkspaceEntryCopyName,
  onWorkspaceEntryCopyPath,
  headings = [],
  onHeadingClick,
  activeHeadingId = null,
  onClose,
}: SidebarLeftProps) {
  const [activeTab, setActiveTab] = useState<'explorer' | 'outline'>('explorer');
  const [workspaceExpanded, setWorkspaceExpanded] = useState(() => loadRootWorkspaceExpanded(workspaceName));
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<Record<string, boolean>>({});
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const workspaceSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedWorkspaceResults, setExpandedWorkspaceResults] = useState<Record<string, boolean>>({});
  const [workspaceCreateMenuOpen, setWorkspaceCreateMenuOpen] = useState(false);
  const workspaceCreateMenuRef = useRef<HTMLDivElement | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const inlineEditInputRef = useRef<HTMLInputElement | null>(null);
  const inlineEditCancelRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<WorkspaceContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [collapsedHeadingIndices, setCollapsedHeadingIndices] = useState<Set<number>>(new Set());

  const toggleCollapseHeading = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedHeadingIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleToggleCollapseAllHeadings = () => {
    if (collapsedHeadingIndices.size > 0) {
      setCollapsedHeadingIndices(new Set());
    } else {
      const allParentIndices = new Set<number>();
      for (let i = 0; i < headings.length; i++) {
        if (headings[i + 1] && headings[i + 1].level > headings[i].level) {
          allParentIndices.add(i);
        }
      }
      setCollapsedHeadingIndices(allParentIndices);
    }
  };

  const visibleHeadings = useMemo(() => {
    const list: { heading: (typeof headings)[0]; index: number; hasChildren: boolean; isCollapsed: boolean }[] = [];
    let hiddenBelowLevel: number | null = null;

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const nextH = headings[i + 1];
      const hasChildren = Boolean(nextH && nextH.level > h.level);
      const isCollapsed = collapsedHeadingIndices.has(i);

      if (hiddenBelowLevel !== null) {
        if (h.level > hiddenBelowLevel) {
          continue;
        } else {
          hiddenBelowLevel = null;
        }
      }

      list.push({ heading: h, index: i, hasChildren, isCollapsed });

      if (isCollapsed && hasChildren) {
        hiddenBelowLevel = h.level;
      }
    }

    return list;
  }, [headings, collapsedHeadingIndices]);

  const hasWorkspace = Boolean(workspaceName);
  const isWorkspaceSearching = workspaceSearchQuery.trim().length > 0;
  const isWorkspaceSearchOpen = workspaceSearchOpen || isWorkspaceSearching;
  const getWorkspaceParentPath = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    segments.pop();
    if (segments.length === 0) {
      return null;
    }
    return segments.join('/');
  };

  const findWorkspaceDirectory = (entries: WorkspaceEntry[], targetPath: string): WorkspaceEntry | null => {
    for (const entry of entries) {
      if (entry.kind === 'directory') {
        if (entry.path === targetPath) {
          return entry;
        }
        const nested = findWorkspaceDirectory(entry.children, targetPath);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  };

  const getWorkspaceEntriesForDirectory = (directoryPath: string | null) => {
    if (!directoryPath) {
      return workspaceEntries;
    }
    const directoryEntry = findWorkspaceDirectory(workspaceEntries, directoryPath);
    return directoryEntry?.kind === 'directory' ? directoryEntry.children : [];
  };

  const getNextDraftFileName = (directoryPath: string | null) => {
    const siblingEntries = getWorkspaceEntriesForDirectory(directoryPath);
    const existingNames = new Set(siblingEntries.map((entry) => entry.name.toLowerCase()));
    let index = 1;
    while (existingNames.has(`untitled-${index}.md`)) {
      index += 1;
    }
    return `Untitled-${index}.md`;
  };

  const getNextDraftFolderName = (directoryPath: string | null) => {
    const siblingEntries = getWorkspaceEntriesForDirectory(directoryPath);
    const existingNames = new Set(siblingEntries.map((entry) => entry.name.toLowerCase()));
    const baseName = '\u65b0\u5efa\u6587\u4ef6\u5939';
    let index = 1;
    let candidate = baseName;
    while (existingNames.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${baseName} ${index}`;
    }
    return candidate;
  };

  const handleInlineEditChange = (value: string) => {
    setInlineEdit((prev) => (prev ? { ...prev, value } : prev));
  };

  const commitInlineEdit = async () => {
    if (inlineEditCancelRef.current) {
      inlineEditCancelRef.current = false;
      return;
    }
    if (!inlineEdit) {
      return;
    }

    if (inlineEdit.mode === 'rename') {
      const result = await onWorkspaceEntryRename(inlineEdit.entry, inlineEdit.value);
      if (result !== false) {
        setInlineEdit(null);
      }
      return;
    }

    if (inlineEdit.mode === 'create') {
      if (inlineEdit.kind === 'file') {
        const result = inlineEdit.targetEntry
          ? await onWorkspaceEntryCreateFile(inlineEdit.targetEntry, inlineEdit.value)
          : await onCreateWorkspaceFile(inlineEdit.value);
        if (result !== false) {
          setInlineEdit(null);
        }
        return;
      }

      const result = inlineEdit.targetEntry
        ? await onWorkspaceEntryCreateFolder(inlineEdit.targetEntry, inlineEdit.value)
        : await onCreateWorkspaceFolder(inlineEdit.value);
      if (result !== false) {
        setInlineEdit(null);
      }
    }
  };

  const cancelInlineEdit = () => {
    inlineEditCancelRef.current = true;
    setInlineEdit(null);
  };

  useEffect(() => {
    if (!inlineEdit) {
      return;
    }

    window.setTimeout(() => {
      const input = inlineEditInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      const value = input.value;
      if (inlineEdit.mode === 'create' && inlineEdit.kind === 'directory') {
        input.select();
        return;
      }
      const dotIndex = value.lastIndexOf('.');
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
      } else {
        input.select();
      }
    }, 0);
  }, [inlineEdit]);

  useEffect(() => {
    if (!isWorkspaceSearching) {
      setExpandedWorkspaceResults({});
      return;
    }

    const expanded: Record<string, boolean> = {};
    workspaceSearchResults.forEach((result) => {
      expanded[result.entry.path] = true;
    });
    setExpandedWorkspaceResults(expanded);
  }, [workspaceSearchResults, isWorkspaceSearching]);

  const toggleWorkspaceResult = (path: string) => {
    setExpandedWorkspaceResults((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const toggleWorkspaceDirectory = (path: string) => {
    setExpandedDirectoryPaths((prev) => {
      const next = {
        ...prev,
        [path]: !prev[path],
      };
      saveExpandedDirectoryPaths(workspaceName, next);
      return next;
    });
  };

  useEffect(() => {
    setExpandedDirectoryPaths(loadExpandedDirectoryPaths(workspaceName));
    setWorkspaceExpanded(loadRootWorkspaceExpanded(workspaceName));
  }, [workspaceName]);

  const toggleRootWorkspace = () => {
    setWorkspaceExpanded((prev) => {
      const next = !prev;
      saveRootWorkspaceExpanded(workspaceName, next);
      return next;
    });
  };

  const toggleWorkspaceSearch = () => {
    if (!hasWorkspace) {
      return;
    }

    if (isWorkspaceSearchOpen) {
      setWorkspaceSearchOpen(false);
      if (workspaceSearchQuery.trim()) {
        onWorkspaceSearchChange('');
      }
      return;
    }

    setWorkspaceSearchOpen(true);
    window.setTimeout(() => workspaceSearchInputRef.current?.focus(), 0);
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => (prev.open ? { ...prev, open: false, entry: null } : prev));
  };

  const startInlineCreate = (kind: 'file' | 'directory', entry: WorkspaceEntry | null) => {
    if (!hasWorkspace || !workspaceWritable) {
      if (kind === 'file') {
        onCreateWorkspaceFile();
      } else {
        onCreateWorkspaceFolder();
      }
      return;
    }

    const parentPath = entry ? (entry.kind === 'directory' ? entry.path : getWorkspaceParentPath(entry.path)) : null;
    const defaultName = kind === 'file'
      ? getNextDraftFileName(parentPath)
      : getNextDraftFolderName(parentPath);

    setWorkspaceExpanded(true);
    if (parentPath) {
      setExpandedDirectoryPaths((prev) => ({
        ...prev,
        [parentPath]: true,
      }));
    }
    setInlineEdit({
      mode: 'create',
      kind,
      parentPath,
      targetEntry: entry,
      value: defaultName,
    });
    closeContextMenu();
  };

  const startInlineRename = (entry: WorkspaceFileEntry) => {
    if (!workspaceWritable) {
      return;
    }
    setInlineEdit({ mode: 'rename', entry, value: entry.name });
    closeContextMenu();
  };

  const handleEntryContextMenu = (event: React.MouseEvent, entry: WorkspaceEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      entry,
    });
  };

  useEffect(() => {
    if (!contextMenu.open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        closeContextMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    document.removeEventListener('keydown', handleKeyDown);
  };
  }, [contextMenu.open]);

  useEffect(() => {
    if (!workspaceCreateMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (workspaceCreateMenuRef.current && !workspaceCreateMenuRef.current.contains(event.target as Node)) {
        setWorkspaceCreateMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkspaceCreateMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [workspaceCreateMenuOpen]);

  const contextMenuTarget = contextMenu.entry;
  const isContextMenuOpen = contextMenu.open && contextMenuTarget;
  const menuWidth = 190;
  const menuHeight = contextMenuTarget?.kind === 'file' ? 290 : 290;
  const viewportPadding = 8;
  const menuPosition = {
    left: Math.min(contextMenu.x, window.innerWidth - menuWidth - viewportPadding),
    top: Math.min(contextMenu.y, window.innerHeight - menuHeight - viewportPadding),
  };

  const handleContextMenuAction = (action: () => unknown, disabled?: boolean) => {
    if (disabled) {
      return;
    }
    void action();
    closeContextMenu();
  };

  return (
    <aside className="w-full h-full min-h-0 shrink-0 flex flex-col border-r border-slate-200 dark:border-dark-border bg-slate-50/50 dark:bg-dark-sidebar transition-colors duration-200 relative group/sidebar">
      <div className="flex p-2 gap-1 border-b border-slate-200 dark:border-dark-border transition-colors duration-200">
        <button
          onClick={() => setActiveTab('explorer')}
          className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'explorer' ? "bg-white dark:bg-dark-active text-accent shadow-sm" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-active/50")}
        >
          <FolderOpen size={14} />
          资源管理器
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'outline' ? "bg-white dark:bg-dark-active text-accent shadow-sm" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-active/50")}
        >
          <FileText size={14} />
          大纲
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-dark-active rounded-md transition-all"
          title="收起侧边栏"
        >
          <span className="text-sm font-semibold leading-none">&lt;</span>
        </button>
      </div>

      <div data-testid="sidebar-scroll-container" className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3">
        {activeTab === 'explorer' ? (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">工作空间</span>
                <div className="flex gap-1">
                  <button
                    onClick={onOpenWorkspace}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                    title="打开工作区"
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    onClick={toggleWorkspaceSearch}
                    disabled={!hasWorkspace}
                    className={cn("p-1 rounded transition-colors",
                      hasWorkspace
                        ? "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        : "text-slate-300 opacity-60 cursor-not-allowed",
                      isWorkspaceSearchOpen && "text-accent"
                    )}
                    title="搜索工作区"
                  >
                    <Search size={14} />
                  </button>
                  <button
                    onClick={() => void onRefreshWorkspace()}
                    disabled={!hasWorkspace}
                    className={cn(
                      "p-1 rounded transition-colors",
                      hasWorkspace
                        ? "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        : "text-slate-300 opacity-60 cursor-not-allowed"
                    )}
                    title="刷新工作区"
                    aria-label="刷新工作区"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <div className="relative" ref={workspaceCreateMenuRef}>
                    <button
                      onClick={() => setWorkspaceCreateMenuOpen((prev) => !prev)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        workspaceCreateMenuOpen
                          ? "text-accent"
                          : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      )}
                      title="新建"
                    >
                      <Plus size={14} />
                    </button>
                    <AnimatePresence>
                      {workspaceCreateMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="absolute right-0 top-full mt-1 w-36 rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#0E0E11] shadow-lg z-20 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setWorkspaceCreateMenuOpen(false);
                              startInlineCreate('file', null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A]/60"
                          >
                            <Plus size={12} />
                            新建文件
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWorkspaceCreateMenuOpen(false);
                              startInlineCreate('directory', null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A]/60"
                          >
                            <FolderPlus size={12} />
                            新建文件夹
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {workspaceNotice ? (
                <div className="mx-2 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {workspaceNotice}
                </div>
              ) : null}
              <AnimatePresence>
                {isWorkspaceSearchOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mx-2 mb-2 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        ref={workspaceSearchInputRef}
                        type="search"
                        value={workspaceSearchQuery}
                        onChange={(event) => onWorkspaceSearchChange(event.target.value)}
                        placeholder="搜索工作区文件"
                        aria-label="搜索工作区文件"
                        disabled={!hasWorkspace}
                        className="flex-1 min-w-[140px] rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus-border-accent focus:ring-1 ring-accent transition-colors disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => onWorkspaceSearchOptionsChange({ caseSensitive: !workspaceSearchOptions.caseSensitive })}
                        disabled={!hasWorkspace}
                        className={cn(
                          "px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors",
                          workspaceSearchOptions.caseSensitive
                            ? "border-accent text-accent bg-accent-soft"
                            : "border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600",
                          !hasWorkspace && "opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-[#27272A]"
                        )}
                        title="大小写匹配"
                      >
                        Aa
                      </button>
                      <button
                        type="button"
                        onClick={() => onWorkspaceSearchOptionsChange({ wholeWord: !workspaceSearchOptions.wholeWord })}
                        disabled={!hasWorkspace}
                        className={cn(
                          "px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors",
                          workspaceSearchOptions.wholeWord
                            ? "border-accent text-accent bg-accent-soft"
                            : "border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600",
                          !hasWorkspace && "opacity-50 cursor-not-allowed hover:border-slate-200 dark:hover:border-[#27272A]"
                        )}
                        title="全词匹配"
                      >
                        W
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!hasWorkspace ? (
                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">尚未打开工作区</div>
              ) : isWorkspaceSearching ? (
                <div className="space-y-2">
                  {workspaceSearchHasFallback && (
                    <div className="mx-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      部分文件无法读取，已按文件名匹配
                    </div>
                  )}
                  {workspaceSearchStatus === 'searching' ? (
                    <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">搜索中...</div>
                  ) : workspaceSearchResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">无匹配结果</div>
                  ) : (
                    <div className="max-h-[52vh] overflow-y-auto pr-1 custom-scrollbar space-y-2">
                      {workspaceSearchResults.map((result) => {
                      const isActive = activeWorkspaceFilePath === result.entry.path;
                      const isExpandable = result.matchedBy === 'content' && result.matches.length > 0;
                      const isExpanded = expandedWorkspaceResults[result.entry.path] ?? true;

                      return (
                        <div
                          key={result.entry.path}
                          className="rounded-md border border-slate-200/70 bg-white/60 px-2 py-1.5 dark:border-[#27272A] dark:bg-[#18181B]/60"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isExpandable) {
                                toggleWorkspaceResult(result.entry.path);
                              } else {
                                onOpenWorkspaceFile(result.entry);
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors min-w-0',
                              isActive
                                ? 'bg-accent-soft text-accent'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]/50'
                            )}
                          >
                            <ChevronRight
                              size={14}
                              className={cn(
                                'shrink-0 text-slate-400 transition-transform',
                                isExpandable ? 'opacity-100' : 'opacity-0',
                                isExpanded && isExpandable && 'rotate-90'
                              )}
                            />
                            <FileText size={14} className="shrink-0" />
                            <span className={cn('truncate', isActive && 'font-medium')}>{result.entry.name}</span>
                            {result.matchedBy === 'filename' ? (
                              <span className="ml-auto text-[10px] text-amber-500">文件名</span>
                            ) : (
                              <span className="ml-auto text-[10px] text-slate-400">{result.matchCount}</span>
                            )}
                          </button>

                          {isExpanded && result.matchedBy === 'filename' && (
                            <div className="px-6 pb-1 text-[10px] text-amber-600 dark:text-amber-300">
                              内容不可读取，仅按文件名匹配
                            </div>
                          )}

                          {isExpanded && result.matchedBy === 'content' && result.matches.length > 0 && (
                            <div className="mt-1 space-y-1 pl-6 pr-2 pb-1">
                              {result.matches.map((match) => (
                                <button
                                  key={`${result.entry.path}-${match.line}-${match.matchIndex}`}
                                  type="button"
                                  data-testid={`workspace-search-match-${result.entry.path}-${match.line}`}
                                  onClick={() => {
                                    if (onWorkspaceSearchMatchClick) {
                                      onWorkspaceSearchMatchClick(result.entry, match);
                                    } else {
                                      onOpenWorkspaceFile(result.entry);
                                    }
                                  }}
                                  className="w-full flex items-start gap-2 rounded-md px-2 py-1 text-left text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27272A]/50 min-w-0"
                                  aria-label={`跳转到第 ${match.line} 行`}
                                >
                                  <span className="w-8 shrink-0 text-[10px] font-mono text-slate-400 dark:text-slate-500 text-right">
                                    {match.line}
                                  </span>
                                  <span className="flex-1 min-w-0 truncate">
                                    {renderHighlightedPreview(match.preview, match.highlights)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <button
                    aria-expanded={workspaceExpanded}
                    onClick={toggleRootWorkspace}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#27272A]/50 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <ChevronRight size={14} className={cn('transition-transform text-slate-400', workspaceExpanded && 'rotate-90')} />
                    <FolderOpen size={16} className="text-accent" />
                    <span className="text-sm font-medium truncate">{workspaceName}</span>
                  </button>

                  <AnimatePresence>
                    {workspaceExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-0.5 space-y-0.5 transition-colors duration-200"
                      >
                        {workspaceEntries.length > 0 ? (
                          <WorkspaceTree
                            entries={workspaceEntries}
                            activeWorkspaceFilePath={activeWorkspaceFilePath}
                            onOpenWorkspaceFile={onOpenWorkspaceFile}
                            onEntryContextMenu={handleEntryContextMenu}
                            contextTargetPath={contextMenu.entry?.path ?? null}
                            inlineEdit={inlineEdit}
                            inlineEditInputRef={inlineEditInputRef}
                            onInlineEditChange={handleInlineEditChange}
                            onInlineEditCommit={commitInlineEdit}
                            onInlineEditCancel={cancelInlineEdit}
                            expandedDirectoryPaths={expandedDirectoryPaths}
                            onToggleDirectory={toggleWorkspaceDirectory}
                          />
                        ) : (
                          <div className="ml-4 px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">
                            暂无可显示的 Markdown 文件或文件夹
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              )}

            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">最近打开</span>
                <button
                  onClick={onOpenFile}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                  title="打开文件"
                >
                  <FileText size={14} />
                </button>
              </div>
              {recentFiles.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">无最近文件</div>
              ) : (
                recentFiles.map((file, index) => (
                  <button
                    key={`${file.name}-${index}`}
                    onClick={() => onOpenRecentFile(file)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-active/50 transition-colors"
                  >
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {headings.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-600 italic">无大纲内容</div>
            ) : (
              <>
                <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-slate-100 dark:border-white/5 text-[11px] text-slate-400">
                  <span>文档大纲 ({headings.length})</span>
                  {headings.some((h, i) => headings[i + 1] && headings[i + 1].level > h.level) && (
                    <button
                      type="button"
                      onClick={handleToggleCollapseAllHeadings}
                      className="hover:text-accent transition-colors text-[10px]"
                    >
                      {collapsedHeadingIndices.size > 0 ? '全部展开' : '全部折叠'}
                    </button>
                  )}
                </div>
                {visibleHeadings.map(({ heading, index, hasChildren, isCollapsed }) => {
                  const isActive = activeHeadingId && (heading.id === activeHeadingId || heading.text === activeHeadingId);
                  return (
                    <div
                      key={`${index}-${heading.text}`}
                      className={cn(
                        "group flex items-center gap-1.5 text-xs py-1.5 pr-2 truncate cursor-pointer rounded-md transition-all",
                        isActive
                          ? "bg-accent-soft text-accent font-bold shadow-xs border-l-2 border-accent pl-2"
                          : heading.level === 1
                          ? "font-bold text-slate-800 dark:text-slate-200 hover:text-accent hover:bg-slate-100 dark:hover:bg-dark-active/50"
                          : "text-slate-600 dark:text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-dark-active/50"
                      )}
                      style={{ paddingLeft: isActive ? `${(heading.level - 1) * 12 + 6}px` : `${(heading.level - 1) * 12 + 4}px` }}
                      onClick={() => {
                        if (onHeadingClick && heading.pos !== undefined) {
                          onHeadingClick(heading.pos);
                        }
                      }}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => toggleCollapseHeading(index, e)}
                          className="p-0.5 rounded text-slate-400 hover:text-accent hover:bg-slate-200/50 dark:hover:bg-white/10 shrink-0 transition-colors"
                          title={isCollapsed ? '展开子章节' : '折叠子章节'}
                        >
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </button>
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate flex-1">{heading.text}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {isContextMenuOpen && contextMenuTarget && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label={'\u5de6\u4fa7\u680f\u53f3\u952e\u83dc\u5355'}
          className="fixed z-50 w-[190px] rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#111114] shadow-xl overflow-hidden"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!workspaceWritable}
            onClick={() =>
              handleContextMenuAction(
                () => startInlineCreate('file', contextMenuTarget),
                !workspaceWritable
              )
            }
            className={cn(
              'w-full px-3 py-2 text-left text-sm transition-colors',
              workspaceWritable
                ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23]'
                : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
            )}
          >
            {'\u65b0\u5efa\u6587\u4ef6'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!workspaceWritable}
            onClick={() =>
              handleContextMenuAction(
                () => startInlineCreate('directory', contextMenuTarget),
                !workspaceWritable
              )
            }
            className={cn(
              'w-full px-3 py-2 text-left text-sm transition-colors',
              workspaceWritable
                ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23]'
                : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
            )}
          >
            {'\u65b0\u5efa\u6587\u4ef6\u5939'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!workspaceWritable || contextMenuTarget.kind !== 'file'}
            onClick={() =>
              handleContextMenuAction(
                () => startInlineRename(contextMenuTarget as WorkspaceFileEntry),
                !workspaceWritable || contextMenuTarget.kind !== 'file'
              )
            }
            className={cn(
              'w-full px-3 py-2 text-left text-sm transition-colors',
              workspaceWritable && contextMenuTarget.kind === 'file'
                ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23]'
                : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
            )}
          >
            {'\u91cd\u547d\u540d'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!workspaceWritable}
            onClick={() =>
              handleContextMenuAction(
                () => onWorkspaceEntryDelete(contextMenuTarget),
                !workspaceWritable
              )
            }
            className={cn(
              'w-full px-3 py-2 text-left text-sm transition-colors',
              workspaceWritable
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                : 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
            )}
          >
            {'\u5220\u9664'}
          </button>
          <div className="h-px bg-slate-200/70 dark:bg-[#27272A]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => handleContextMenuAction(() => onWorkspaceEntryOpenPath(contextMenuTarget))}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23] transition-colors"
          >
            {'\u6253\u5f00\u8def\u5f84'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleContextMenuAction(() => onWorkspaceEntryCopyName(contextMenuTarget))}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23] transition-colors"
          >
            {'\u590d\u5236\u6587\u4ef6\u540d'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleContextMenuAction(() => onWorkspaceEntryCopyPath(contextMenuTarget))}
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f1f23] transition-colors"
          >
            {'\u590d\u5236\u8def\u5f84'}
          </button>
        </div>
      )}
    </aside>
  );
}

export default React.memo(SidebarLeftComponent);













