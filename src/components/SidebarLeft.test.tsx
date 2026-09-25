import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SidebarLeft from './SidebarLeft';
import type { WorkspaceEntry, WorkspaceFileEntry } from '../lib/fileSystem';

function ensureMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });
}

function renderSidebar(overrides: Record<string, unknown> = {}) {
  const entry = {
    id: 'notes.md',
    kind: 'file',
    name: 'notes.md',
    path: 'notes.md',
    handle: {},
  } as WorkspaceFileEntry;

  const props = {
    onOpenFile: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onRefreshWorkspace: vi.fn(),
    onCreateWorkspaceFile: vi.fn(),
    onCreateWorkspaceFolder: vi.fn(),
    onOpenWorkspaceFile: vi.fn(),
    onOpenRecentFile: vi.fn(),
    recentFiles: [],
    workspaceName: 'Workspace',
    workspaceEntries: [entry],
    activeWorkspaceFilePath: null,
    workspaceNotice: null,
    workspaceWritable: true,
    workspaceSearchQuery: '',
    workspaceSearchOptions: { caseSensitive: false, wholeWord: false },
    workspaceSearchResults: [],
    workspaceSearchStatus: 'idle',
    workspaceSearchHasFallback: false,
    onWorkspaceSearchChange: vi.fn(),
    onWorkspaceSearchOptionsChange: vi.fn(),
    onWorkspaceSearchMatchClick: vi.fn(),
    onWorkspaceEntryCreateFile: vi.fn(),
    onWorkspaceEntryCreateFolder: vi.fn(),
    onWorkspaceEntryRename: vi.fn(),
    onWorkspaceEntryDelete: vi.fn(),
    onWorkspaceEntryOpenPath: vi.fn(),
    onWorkspaceEntryCopyName: vi.fn(),
    onWorkspaceEntryCopyPath: vi.fn(),
    headings: [],
    onHeadingClick: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  return {
    entry,
    props,
    ...render(<SidebarLeft {...(props as any)} />),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  ensureMatchMedia();
});

describe('SidebarLeft workspace search', () => {
  it('shows search results and opens match on click', () => {
    const onWorkspaceSearchMatchClick = vi.fn();
    const match = {
      line: 3,
      preview: 'find note here',
      highlights: [{ start: 5, end: 9 }],
      matchIndex: 0,
    };
    const entry = {
      id: 'notes.md',
      kind: 'file',
      name: 'notes.md',
      path: 'notes.md',
      handle: {},
    } as WorkspaceFileEntry;
    renderSidebar({
      onWorkspaceSearchMatchClick,
      workspaceEntries: [entry],
      workspaceSearchQuery: 'note',
      workspaceSearchStatus: 'done',
      workspaceSearchResults: [
        { entry, matchCount: 1, matchedBy: 'content', matches: [match] },
      ],
    });

    fireEvent.click(screen.getByLabelText('跳转到第 3 行'));

    expect(onWorkspaceSearchMatchClick).toHaveBeenCalledWith(entry, match);
  });

  it('marks filename-only matches when content is unavailable', () => {
    renderSidebar({
      workspaceSearchQuery: 'note',
      workspaceSearchStatus: 'done',
      workspaceSearchHasFallback: true,
      workspaceSearchResults: [
        { entry: { id: 'a.md', kind: 'file', name: 'a.md', path: 'a.md' }, matchCount: 0, matchedBy: 'filename', matches: [] },
      ],
    });

    expect(screen.getByText('\u6587\u4ef6\u540d')).toBeInTheDocument();
  });

  it('shows workspace tree when search is cleared', () => {
    renderSidebar({
      workspaceSearchQuery: '',
      workspaceSearchOptions: { caseSensitive: false, wholeWord: false },
      workspaceSearchStatus: 'idle',
      workspaceSearchResults: [],
    });

    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('keeps explorer content inside its own scroll container', () => {
    renderSidebar();

    const scrollContainer = screen.getByTestId('sidebar-scroll-container');

    expect(scrollContainer).toHaveClass('min-h-0');
    expect(scrollContainer).toHaveClass('overflow-y-auto');
    expect(scrollContainer).toHaveClass('custom-scrollbar');
  });

  it('keeps workspace folders collapsed by default and expands them independently', () => {
    const workspaceEntries = [
      {
        id: 'src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        children: [
          {
            id: 'src/deep',
            kind: 'directory',
            name: 'deep',
            path: 'src/deep',
            children: [
              {
                id: 'src/deep/a.md',
                kind: 'file',
                name: 'a.md',
                path: 'src/deep/a.md',
                handle: {},
              },
            ],
          },
        ],
      },
    ] as WorkspaceEntry[];

    renderSidebar({ workspaceEntries });

    const srcButton = screen.getByRole('button', { name: 'src' });
    expect(srcButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'deep' })).not.toBeInTheDocument();
    expect(screen.queryByText('a.md')).not.toBeInTheDocument();

    fireEvent.click(srcButton);

    const deepButton = screen.getByRole('button', { name: 'deep' });
    expect(srcButton).toHaveAttribute('aria-expanded', 'true');
    expect(deepButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('a.md')).not.toBeInTheDocument();

    fireEvent.click(deepButton);

    expect(screen.getByText('a.md')).toBeInTheDocument();
    expect(deepButton).toHaveAttribute('aria-expanded', 'true');
    expect(srcButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(deepButton);

    expect(screen.queryByText('a.md')).not.toBeInTheDocument();
    expect(deepButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('restores only user-expanded workspace folders on the next startup', async () => {
    const workspaceEntries = [
      {
        id: 'docs',
        kind: 'directory',
        name: 'docs',
        path: 'docs',
        children: [
          {
            id: 'docs/guide.md',
            kind: 'file',
            name: 'guide.md',
            path: 'docs/guide.md',
            handle: {},
          },
        ],
      },
      {
        id: 'src',
        kind: 'directory',
        name: 'src',
        path: 'src',
        children: [
          {
            id: 'src/app.md',
            kind: 'file',
            name: 'app.md',
            path: 'src/app.md',
            handle: {},
          },
        ],
      },
    ] as WorkspaceEntry[];

    const firstRender = renderSidebar({ workspaceName: 'Project A', workspaceEntries });
    fireEvent.click(screen.getByRole('button', { name: 'docs' }));

    await waitFor(() => {
      expect(localStorage.getItem('lumina-workspace-expanded-directories:Project A')).toBe(
        JSON.stringify(['docs'])
      );
    });

    firstRender.unmount();
    cleanup();
    renderSidebar({ workspaceName: 'Project A', workspaceEntries });

    expect(screen.getByRole('button', { name: 'docs' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('guide.md')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'src' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('app.md')).not.toBeInTheDocument();
  });

  it('does not reuse expanded folder state across different workspaces', () => {
    localStorage.setItem('lumina-workspace-expanded-directories:Project A', JSON.stringify(['docs']));
    const workspaceEntries = [
      {
        id: 'docs',
        kind: 'directory',
        name: 'docs',
        path: 'docs',
        children: [
          {
            id: 'docs/guide.md',
            kind: 'file',
            name: 'guide.md',
            path: 'docs/guide.md',
            handle: {},
          },
        ],
      },
    ] as WorkspaceEntry[];

    renderSidebar({ workspaceName: 'Project B', workspaceEntries });

    expect(screen.getByRole('button', { name: 'docs' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('guide.md')).not.toBeInTheDocument();
  });

  it('remembers when the user collapses the root workspace folder', () => {
    const workspaceEntries = [
      {
        id: 'docs',
        kind: 'directory',
        name: 'docs',
        path: 'docs',
        children: [],
      },
    ] as WorkspaceEntry[];

    const firstRender = renderSidebar({ workspaceName: 'Project A', workspaceEntries });
    fireEvent.click(screen.getByRole('button', { name: 'Project A' }));

    expect(localStorage.getItem('lumina-workspace-root-expanded:Project A')).toBe('false');

    firstRender.unmount();
    cleanup();
    renderSidebar({ workspaceName: 'Project A', workspaceEntries });

    expect(screen.getByRole('button', { name: 'Project A' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'docs' })).not.toBeInTheDocument();
  });

  it('triggers workspace refresh from the toolbar', () => {
    const onRefreshWorkspace = vi.fn();
    renderSidebar({ onRefreshWorkspace });

    fireEvent.click(screen.getByLabelText('刷新工作区'));

    expect(onRefreshWorkspace).toHaveBeenCalledTimes(1);
  });

  it('opens context menu on file entry and triggers copy action', () => {
    const onWorkspaceEntryCopyName = vi.fn();
    const { entry } = renderSidebar({ onWorkspaceEntryCopyName });

    fireEvent.contextMenu(screen.getByText('notes.md'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('\u590d\u5236\u6587\u4ef6\u540d'));

    expect(onWorkspaceEntryCopyName).toHaveBeenCalledWith(entry);
  });

  it('triggers delete action from the context menu', () => {
    const onWorkspaceEntryDelete = vi.fn();
    const { entry } = renderSidebar({ onWorkspaceEntryDelete });

    fireEvent.contextMenu(screen.getByText('notes.md'));

    fireEvent.click(screen.getByText('\u5220\u9664'));

    expect(onWorkspaceEntryDelete).toHaveBeenCalledWith(entry);
  });

  it('disables create actions in read-only workspace', () => {
    renderSidebar({ workspaceWritable: false });

    fireEvent.contextMenu(screen.getByText('notes.md'));

    expect(screen.getByText('\u65b0\u5efa\u6587\u4ef6')).toBeDisabled();
    expect(screen.getByText('\u65b0\u5efa\u6587\u4ef6\u5939')).toBeDisabled();
    expect(screen.getByText('\u5220\u9664')).toBeDisabled();
  });
});
