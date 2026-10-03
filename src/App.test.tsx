import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const {
  mockOpenFile,
  mockOpenDirectory,
  mockReadFile,
  mockReadWorkspaceEntries,
  mockRestoreNativeWorkspace,
  mockWriteFile,
  mockCreateNativeWorkspaceDirectory,
  mockCreateNativeWorkspaceFileHandle,
  mockDeleteNativeWorkspaceEntry,
  mockRenameNativeWorkspaceEntry,
  mockRevealNativeWorkspaceEntry,
  mockSetNativeWindowTitle,
  mockWriteNativeWorkspaceBinary,
  mockWriteNativeWorkspaceFile,
  mockEditor,
} = vi.hoisted(() => {
  const commands = {
    setContent: vi.fn(),
  };

  return {
    mockOpenFile: vi.fn(),
    mockOpenDirectory: vi.fn(),
    mockReadFile: vi.fn(),
    mockReadWorkspaceEntries: vi.fn(),
    mockRestoreNativeWorkspace: vi.fn(),
    mockWriteFile: vi.fn(),
    mockCreateNativeWorkspaceDirectory: vi.fn(),
    mockCreateNativeWorkspaceFileHandle: vi.fn((workspaceId: string, path: string, name: string) => ({
      source: 'tauri-file',
      workspaceId,
      path,
      name,
    })),
    mockDeleteNativeWorkspaceEntry: vi.fn(),
    mockRenameNativeWorkspaceEntry: vi.fn(),
    mockRevealNativeWorkspaceEntry: vi.fn(),
    mockSetNativeWindowTitle: vi.fn(),
    mockWriteNativeWorkspaceBinary: vi.fn(),
    mockWriteNativeWorkspaceFile: vi.fn(),
    mockEditor: {
      isFocused: false,
      storage: {
        markdown: {
          getMarkdown: vi.fn(() => ''),
        },
      },
      commands,
      state: {
        doc: {
          descendants: vi.fn(),
        },
      },
    },
  };
});

vi.mock('framer-motion', () => {
  const createMotionComponent = (tag: keyof React.JSX.IntrinsicElements) =>
    React.forwardRef<HTMLElement, any>(({ children, initial, animate, exit, transition, ...props }, ref) =>
      React.createElement(tag, { ...props, ref }, children)
    );

  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => createMotionComponent(tag as keyof React.JSX.IntrinsicElements),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('./components/SidebarLeft', () => ({
  default: (props: any): ReactNode => (
    <div>
      <button type="button" data-testid="sidebar-open-workspace" onClick={props.onOpenWorkspace} />
      <button type="button" data-testid="sidebar-refresh-workspace" onClick={props.onRefreshWorkspace} />
      <button type="button" data-testid="sidebar-create-folder" onClick={props.onCreateWorkspaceFolder} />
      <button type="button" data-testid="sidebar-create-file" onClick={props.onCreateWorkspaceFile} />
      <button type="button" data-testid="sidebar-open-file" onClick={props.onOpenFile} />
      <button type="button" data-testid="sidebar-outline" onClick={() => {}} />
      {props.workspaceName ? <div>{props.workspaceName}</div> : null}
      {props.workspaceNotice ? <div>{props.workspaceNotice}</div> : null}
      {props.workspaceEntries?.map((entry: any) => (
        <React.Fragment key={entry.path}>
          <button
            type="button"
            onClick={() => entry.kind === 'file' && props.onOpenWorkspaceFile(entry)}
          >
            {entry.name}
          </button>
          <button
            type="button"
            data-testid="workspace-rename"
            onClick={() => entry.kind === 'file' && props.onWorkspaceEntryRename?.(entry, 'renamed.md')}
          />
          <button
            type="button"
            data-testid="workspace-create-file"
            onClick={() => props.onWorkspaceEntryCreateFile?.(entry)}
          />
          <button
            type="button"
            data-testid="workspace-create-folder"
            onClick={() => props.onWorkspaceEntryCreateFolder?.(entry)}
          />
          <button
            type="button"
            data-testid="workspace-copy-name"
            onClick={() => props.onWorkspaceEntryCopyName?.(entry)}
          />
          <button
            type="button"
            data-testid="workspace-copy-path"
            onClick={() => props.onWorkspaceEntryCopyPath?.(entry)}
          />
          <button
            type="button"
            data-testid="workspace-open-path"
            onClick={() => props.onWorkspaceEntryOpenPath?.(entry)}
          />
        </React.Fragment>
      ))}
      {props.recentFiles?.map((file: any, index: number) => (
        <button key={`${file.name}-${index}`} type="button" onClick={() => props.onOpenRecentFile(file)}>
          {file.name}
        </button>
      ))}
      {props.headings?.map((heading: any, index: number) => (
        <button
          key={`${heading.id ?? heading.text}-${index}`}
          type="button"
          onClick={() => props.onHeadingClick?.(heading.pos)}
        >
          {heading.text}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  ReactNodeViewRenderer: () => () => null,
}));

vi.mock('./components/Header', () => ({
  default: () => null,
}));

vi.mock('./components/Editor', () => ({
  default: ({ content, setContent }: { content: string; setContent?: (c: string) => void }) => (
    <div>
      <div data-testid="editor-content">{content}</div>
      <button data-testid="editor-update-content" onClick={() => setContent?.('# draft updated')} />
    </div>
  ),
}));

vi.mock('./components/SidebarRight', () => ({
  default: () => null,
}));

vi.mock('./components/Footer', () => ({
  default: () => null,
}));

vi.mock('./components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('./components/AICenterModal', () => ({
  default: () => null,
}));

vi.mock('./components/AboutModal', () => ({
  default: () => null,
}));

vi.mock('./lib/fileSystem', () => ({
  openFile: mockOpenFile,
  openDirectory: mockOpenDirectory,
  readFile: mockReadFile,
  readWorkspaceEntries: mockReadWorkspaceEntries,
  restoreNativeWorkspace: mockRestoreNativeWorkspace,
  writeFile: mockWriteFile,
}));

vi.mock('./services/workspace', () => ({
  createNativeWorkspaceDirectory: mockCreateNativeWorkspaceDirectory,
  createNativeWorkspaceFileHandle: mockCreateNativeWorkspaceFileHandle,
  deleteNativeWorkspaceEntry: mockDeleteNativeWorkspaceEntry,
  isNativeFileHandle: (value: unknown) =>
    Boolean(value && typeof value === 'object' && (value as any).source === 'tauri-single-file'),
  isNativeWorkspaceDirectoryHandle: (value: unknown) =>
    Boolean(value && typeof value === 'object' && (value as any).source === 'tauri'),
  isNativeWorkspaceFileHandle: (value: unknown) =>
    Boolean(value && typeof value === 'object' && (value as any).source === 'tauri-file'),
  renameNativeWorkspaceEntry: mockRenameNativeWorkspaceEntry,
  revealNativeWorkspaceEntry: mockRevealNativeWorkspaceEntry,
  writeNativeWorkspaceBinary: mockWriteNativeWorkspaceBinary,
  writeNativeWorkspaceFile: mockWriteNativeWorkspaceFile,
}));

vi.mock('./services/native', () => ({
  isTauriRuntime: () => false,
  setNativeWindowTitle: mockSetNativeWindowTitle,
  getNativeCliOpenFile: vi.fn(() => Promise.resolve(null)),
  setNativeAsDefaultEditor: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
  openNativeDefaultAppsSettings: vi.fn(() => Promise.resolve()),
}));

import App from './App';

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
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
  mockEditor.storage.markdown.getMarkdown.mockReturnValue('');
});

beforeEach(() => {
  ensureMatchMedia();
  mockRestoreNativeWorkspace.mockResolvedValue(null);
  mockSetNativeWindowTitle.mockResolvedValue(undefined);
});

function openWorkspaceFromSidebar() {
  fireEvent.click(screen.getByTestId('sidebar-open-workspace'));
}

function openFileFromSidebar() {
  fireEvent.click(screen.getByTestId('sidebar-open-file'));
}

describe('App workspace shell usability', () => {
  it('restores the last native workspace on startup', async () => {
    const nativeDirectoryHandle = {
      source: 'tauri',
      workspaceId: 'D:/Project',
      name: 'Project',
      rootPath: 'D:/Project',
    };
    const nativeFileHandle = {
      source: 'tauri-file',
      workspaceId: 'D:/Project',
      path: 'README.md',
      name: 'README.md',
    };
    mockRestoreNativeWorkspace.mockResolvedValue({
      name: 'Project',
      directoryHandle: nativeDirectoryHandle,
      entries: [
        {
          id: 'README.md',
          kind: 'file',
          name: 'README.md',
          path: 'README.md',
          handle: nativeFileHandle,
        },
      ],
      writable: true,
      source: 'tauri',
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('Project')).toBeInTheDocument());
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(mockRestoreNativeWorkspace).toHaveBeenCalledTimes(1);
    expect(mockOpenDirectory).not.toHaveBeenCalled();
  });

  it('populates the sidebar with the opened workspace and removes the sync panel', async () => {
    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle: { name: '项目 A', getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() },
      entries: [
        { id: 'docs', name: 'docs', path: 'docs', kind: 'directory', children: [] },
        { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
      ],
      writable: true,
      source: 'file-system-access',
    });

    render(<App />);

    openWorkspaceFromSidebar();

    await waitFor(() => expect(screen.getByText('项目 A')).toBeInTheDocument());
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.queryByText('同步状态')).not.toBeInTheDocument();
    expect(screen.queryByText('云存储 1.2GB / 2GB')).not.toBeInTheDocument();
  });

  it('opens a real workspace file from the sidebar entry list', async () => {
    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle: { name: '项目 A', getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() },
      entries: [
        { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
      ],
      writable: true,
      source: 'file-system-access',
    });
    mockReadFile.mockResolvedValue('# 工作区文件');

    render(<App />);

    openWorkspaceFromSidebar();

    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument());

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => expect(mockReadFile).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('editor-content')).toHaveTextContent('# 工作区文件');
    await waitFor(() =>
      expect(mockSetNativeWindowTitle).toHaveBeenCalledWith('README.md - 项目 A - Lumina Edit Pro')
    );
    expect(document.title).toBe('README.md - 项目 A - Lumina Edit Pro');
  });

  it('creates a markdown file and folder in a writable workspace', async () => {
    const createdFileHandle = { name: 'Untitled-1.md' };
    const directoryHandle = {
      name: '项目 A',
      getFileHandle: vi.fn().mockResolvedValue(createdFileHandle),
      getDirectoryHandle: vi.fn().mockResolvedValue({ name: '新建文件夹' }),
    };

    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle,
      entries: [],
      writable: true,
      source: 'file-system-access',
    });
    mockReadWorkspaceEntries
      .mockResolvedValueOnce([
        { id: 'Untitled-1.md', name: 'Untitled-1.md', path: 'Untitled-1.md', kind: 'file', handle: createdFileHandle },
      ])
      .mockResolvedValueOnce([
        { id: 'Untitled-1.md', name: 'Untitled-1.md', path: 'Untitled-1.md', kind: 'file', handle: createdFileHandle },
        { id: '新建文件夹', name: '新建文件夹', path: '新建文件夹', kind: 'directory', children: [] },
      ]);
    mockReadFile.mockResolvedValue('# 无标题文档\n\n开始写作..');

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('项目 A')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sidebar-create-file'));

    await waitFor(() => expect(directoryHandle.getFileHandle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Untitled-1.md').length).toBeGreaterThan(0);
    expect(screen.getByTestId('editor-content')).toHaveTextContent('# 无标题文档');

    fireEvent.click(screen.getByTestId('sidebar-create-folder'));

    await waitFor(() => expect(directoryHandle.getDirectoryHandle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledTimes(2));
    expect(screen.getByText('新建文件夹')).toBeInTheDocument();
  });

  it('creates files and folders through the native workspace service', async () => {
    const nativeDirectoryHandle = {
      source: 'tauri',
      workspaceId: 'D:/Project',
      name: 'Project',
      rootPath: 'D:/Project',
    };
    const createdFileHandle = {
      source: 'tauri-file',
      workspaceId: 'D:/Project',
      path: 'Untitled-1.md',
      name: 'Untitled-1.md',
    };

    mockOpenDirectory.mockResolvedValue({
      name: 'Project',
      directoryHandle: nativeDirectoryHandle,
      entries: [],
      writable: true,
      source: 'tauri',
    });
    mockReadWorkspaceEntries
      .mockResolvedValueOnce([
        {
          id: 'Untitled-1.md',
          name: 'Untitled-1.md',
          path: 'Untitled-1.md',
          kind: 'file',
          handle: createdFileHandle,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'Untitled-1.md',
          name: 'Untitled-1.md',
          path: 'Untitled-1.md',
          kind: 'file',
          handle: createdFileHandle,
        },
        { id: '新建文件夹', name: '新建文件夹', path: '新建文件夹', kind: 'directory', children: [] },
      ]);

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('Project')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sidebar-create-file'));

    await waitFor(() =>
      expect(mockWriteNativeWorkspaceFile).toHaveBeenCalledWith(
        'D:/Project',
        'Untitled-1.md',
        expect.stringContaining('# 无标题文档')
      )
    );
    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledTimes(1));
    expect(mockCreateNativeWorkspaceFileHandle).toHaveBeenCalledWith(
      'D:/Project',
      'Untitled-1.md',
      'Untitled-1.md'
    );

    fireEvent.click(screen.getByTestId('sidebar-create-folder'));

    await waitFor(() =>
      expect(mockCreateNativeWorkspaceDirectory).toHaveBeenCalledWith('D:/Project', '新建文件夹')
    );
    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledTimes(2));
  });

  it('reveals native workspace entries in the system file manager', async () => {
    const nativeDirectoryHandle = {
      source: 'tauri',
      workspaceId: 'D:/Project',
      name: 'Project',
      rootPath: 'D:/Project',
    };

    mockOpenDirectory.mockResolvedValue({
      name: 'Project',
      directoryHandle: nativeDirectoryHandle,
      entries: [
        { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
      ],
      writable: true,
      source: 'tauri',
    });

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('Project')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('workspace-open-path'));

    await waitFor(() => expect(mockRevealNativeWorkspaceEntry).toHaveBeenCalledWith('D:/Project', 'README.md'));
  });

  it('refreshes the active workspace and removes deleted files from the sidebar', async () => {
    const directoryHandle = { name: 'Project A', getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() };

    mockOpenDirectory.mockResolvedValue({
      name: 'Project A',
      directoryHandle,
      entries: [
        { id: 'notes.md', name: 'notes.md', path: 'notes.md', kind: 'file', handle: { name: 'notes.md' } },
      ],
      writable: true,
      source: 'file-system-access',
    });
    mockReadWorkspaceEntries.mockResolvedValue([
      { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
    ]);

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('notes.md')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sidebar-refresh-workspace'));

    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledWith(directoryHandle));
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('auto-refreshes native workspace entries after external changes', async () => {
    const intervalHandlers: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        intervalHandlers.push(handler as () => void);
      }
      return 1 as any;
    });
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
    const nativeDirectoryHandle = {
      source: 'tauri',
      workspaceId: 'D:/Project',
      name: 'Project',
      rootPath: 'D:/Project',
    };

    mockOpenDirectory.mockResolvedValue({
      name: 'Project',
      directoryHandle: nativeDirectoryHandle,
      entries: [
        { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
      ],
      writable: true,
      source: 'tauri',
    });
    mockReadWorkspaceEntries.mockResolvedValue([
      { id: 'external.md', name: 'external.md', path: 'external.md', kind: 'file', handle: { name: 'external.md' } },
    ]);

    try {
      render(<App />);

      openWorkspaceFromSidebar();
      await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument());
      expect(intervalHandlers.length).toBeGreaterThan(0);

      await act(async () => {
        intervalHandlers.forEach((handler) => handler());
        await Promise.resolve();
      });

      await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledWith(nativeDirectoryHandle));
      expect(screen.queryByText('README.md')).not.toBeInTheDocument();
      expect(screen.getByText('external.md')).toBeInTheDocument();
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it('shows honest messaging when runtime file creation fails and does not add a fake entry', async () => {
    const createdFileHandle = { name: 'Untitled-1.md' };
    const directoryHandle = {
      name: '项目 A',
      getFileHandle: vi.fn().mockResolvedValue(createdFileHandle),
      getDirectoryHandle: vi.fn(),
    };

    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle,
      entries: [],
      writable: true,
      source: 'file-system-access',
    });
    mockWriteFile.mockRejectedValue(new Error('Permission denied'));

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('项目 A')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sidebar-create-file'));

    await waitFor(() => expect(directoryHandle.getFileHandle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockWriteFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('当前工作区未能完成新建文件，请检查浏览器文件夹权限后重试')).toBeInTheDocument());
    expect(mockReadWorkspaceEntries).not.toHaveBeenCalled();
    expect(screen.queryByText('Untitled-1.md')).not.toBeInTheDocument();
  });

  it('shows honest messaging when runtime folder creation fails and does not add a fake entry', async () => {
    const directoryHandle = {
      name: '项目 A',
      getFileHandle: vi.fn(),
      getDirectoryHandle: vi.fn().mockRejectedValue(new Error('Permission denied')),
    };

    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle,
      entries: [],
      writable: true,
      source: 'file-system-access',
    });

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('项目 A')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('sidebar-create-folder'));

    await waitFor(() => expect(directoryHandle.getDirectoryHandle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('当前工作区未能完成新建文件夹，请检查浏览器文件夹权限后重试')).toBeInTheDocument());
    expect(mockReadWorkspaceEntries).not.toHaveBeenCalled();
    expect(screen.queryByText(/^新建文件夹/)).not.toBeInTheDocument();
  });

  it('renames a workspace file from context action', async () => {
    const directoryHandle = {
      name: 'Project A',
      getFileHandle: vi.fn(),
      getDirectoryHandle: vi.fn(),
      removeEntry: vi.fn(),
    };
    const originalHandle = { name: 'notes.md', getFile: vi.fn() };
    const renamedHandle = { name: 'renamed.md' };

    directoryHandle.getFileHandle.mockResolvedValue(renamedHandle);

    mockOpenDirectory.mockResolvedValue({
      name: 'Project A',
      directoryHandle,
      entries: [
        { id: 'notes.md', name: 'notes.md', path: 'notes.md', kind: 'file', handle: originalHandle },
      ],
      writable: true,
      source: 'file-system-access',
    });
    mockReadFile.mockResolvedValue('# note');
    mockWriteFile.mockResolvedValue(undefined);
    mockReadWorkspaceEntries.mockResolvedValue([
      { id: 'renamed.md', name: 'renamed.md', path: 'renamed.md', kind: 'file', handle: renamedHandle },
    ]);

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('notes.md')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('workspace-rename'));

    await waitFor(() => expect(directoryHandle.getFileHandle).toHaveBeenCalledWith('renamed.md', { create: true }));
    await waitFor(() => expect(mockWriteFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(directoryHandle.removeEntry).toHaveBeenCalledWith('notes.md'));
    await waitFor(() => expect(mockReadWorkspaceEntries).toHaveBeenCalledTimes(1));});

  it('shows honest messaging when no workspace is open and create file is clicked', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('sidebar-create-file'));

    await waitFor(() => expect(screen.getByText('请先打开工作区后再新建文件')).toBeInTheDocument());
  });

  it('shows honest messaging when no workspace is open and create folder is clicked', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('sidebar-create-folder'));

    await waitFor(() => expect(screen.getByText('请先打开工作区后再新建文件夹')).toBeInTheDocument());
  });

  it('does not persist unsafe recent file handles across localStorage reload', async () => {
    mockOpenFile.mockResolvedValue({
      fileHandle: { name: 'draft.md', getFile: vi.fn() },
      content: '# draft',
      name: 'draft.md',
    });

    const { unmount } = render(<App />);

    openFileFromSidebar();

    await waitFor(() => expect(screen.getByText('draft.md')).toBeInTheDocument());
    expect(localStorage.getItem('lumina-recent-files')).toBe(JSON.stringify([{ name: 'draft.md' }]));

    unmount();
    render(<App />);

    expect(screen.getByText('draft.md')).toBeInTheDocument();
    fireEvent.click(screen.getByText('draft.md'));

    await waitFor(() => expect(screen.getByText('最近文件记录不包含可重新打开的文件句柄，请重新打开文件')).toBeInTheDocument());
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('shows honest messaging when opening a workspace file fails', async () => {
    mockOpenDirectory.mockResolvedValue({
      name: '项目 A',
      directoryHandle: { name: '项目 A', getFileHandle: vi.fn(), getDirectoryHandle: vi.fn() },
      entries: [
        { id: 'README.md', name: 'README.md', path: 'README.md', kind: 'file', handle: { name: 'README.md' } },
      ],
      writable: true,
      source: 'file-system-access',
    });
    mockReadFile.mockRejectedValue(new Error('Cannot read'));

    render(<App />);

    openWorkspaceFromSidebar();
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument());

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => expect(screen.getByText('未能打开工作区文件，请检查文件权限后重试')).toBeInTheDocument());
  });

  it('shows honest messaging when opening a recent file fails', async () => {
    const fileHandle = { name: 'draft.md', getFile: vi.fn() };
    mockOpenFile.mockResolvedValue({
      fileHandle,
      content: '# draft',
      name: 'draft.md',
    });

    render(<App />);

    openFileFromSidebar();
    await waitFor(() => expect(screen.getByText('draft.md')).toBeInTheDocument());

    mockReadFile.mockRejectedValue(new Error('Cannot read'));

    fireEvent.click(screen.getByText('draft.md'));

    await waitFor(() => expect(screen.getByText('未能重新打开最近文件，请重新选择该文件')).toBeInTheDocument());
  });

  it('shows honest messaging when saving a file fails', async () => {
    mockOpenFile.mockResolvedValue({
      fileHandle: { name: 'draft.md', createWritable: vi.fn() },
      content: '# draft',
      name: 'draft.md',
    });
    mockWriteFile.mockRejectedValue(new Error('Cannot save'));

    render(<App />);

    openFileFromSidebar();
    await waitFor(() => expect(screen.getByText('draft.md')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => expect(screen.getByText('文件保存失败，请检查文件权限后重试')).toBeInTheDocument());
  });

  it('auto-saves single files opened through Tauri native handles', async () => {
    vi.useFakeTimers();
    localStorage.setItem('app-settings', JSON.stringify({ autoSave: true, autoSaveInterval: 3 }));
    mockWriteFile.mockResolvedValue(undefined);
    mockOpenFile.mockResolvedValue({
      fileHandle: {
        source: 'tauri-single-file',
        path: 'D:/docs/draft.md',
        name: 'draft.md',
      },
      content: '# draft',
      name: 'draft.md',
    });

    render(<App />);

    openFileFromSidebar();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('draft.md')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('editor-update-content'));

    await act(async () => {
      vi.advanceTimersByTime(3100);
      await Promise.resolve();
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      {
        source: 'tauri-single-file',
        path: 'D:/docs/draft.md',
        name: 'draft.md',
      },
      '# draft updated'
    );
  });

  it('shows honest read-only messaging and never inserts fake entries', async () => {
    mockOpenDirectory.mockResolvedValue({
      name: '只读工作区',
      directoryHandle: null,
      entries: [
        { id: 'existing.md', name: 'existing.md', path: 'existing.md', kind: 'file', file: new File(['# existing'], 'existing.md') },
      ],
      writable: false,
      source: 'input-fallback',
    });

    render(<App />);

    openWorkspaceFromSidebar();

    await waitFor(() => expect(screen.getByText('只读工作区')).toBeInTheDocument());
    expect(screen.getByText('当前工作区为只读模式，仅支持浏览和打开已有 Markdown 文件，不支持新建文件或文件夹。')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-create-file'));
    await waitFor(() => expect(screen.getByText('当前工作区为只读模式，不支持新建文件')).toBeInTheDocument());
    expect(screen.queryByText('Untitled-1.md')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sidebar-create-folder'));
    await waitFor(() => expect(screen.getByText('当前工作区为只读模式，不支持新建文件夹')).toBeInTheDocument());
    expect(screen.queryByText(/^新建文件夹/)).not.toBeInTheDocument();
  });
});



