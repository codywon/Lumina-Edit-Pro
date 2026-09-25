import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDirectory, openFile, readWorkspaceEntries, restoreNativeWorkspace, writeFile } from './fileSystem';
import { isTauriRuntime } from '../services/native';
import { openNativeFile, openNativeWorkspace, restoreRecentNativeWorkspace, writeNativeFile } from '../services/workspace';

vi.mock('../services/native', () => ({
  isTauriRuntime: vi.fn(() => false),
}));

vi.mock('../services/workspace', () => ({
  createNativeWorkspaceDirectoryHandle: vi.fn((workspace) => ({
    source: 'tauri',
    workspaceId: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
  })),
  createNativeWorkspaceFileHandle: vi.fn((workspaceId, path, name) => ({
    source: 'tauri-file',
    workspaceId,
    path,
    name,
  })),
  createNativeFileHandle: vi.fn((path, name) => ({
    source: 'tauri-single-file',
    path,
    name,
  })),
  isNativeWorkspaceDirectoryHandle: vi.fn((value) => value?.source === 'tauri'),
  isNativeWorkspaceFileHandle: vi.fn((value) => value?.source === 'tauri-file'),
  isNativeFileHandle: vi.fn((value) => value?.source === 'tauri-single-file'),
  listNativeWorkspaceEntries: vi.fn(),
  openNativeFile: vi.fn(),
  openNativeWorkspace: vi.fn(),
  readNativeFile: vi.fn(),
  readNativeWorkspaceFile: vi.fn(),
  restoreRecentNativeWorkspace: vi.fn(),
  writeNativeFile: vi.fn(),
  writeNativeWorkspaceFile: vi.fn(),
}));

function mockInputSelection(files: File[] | null) {
  const originalCreateElement = document.createElement.bind(document);
  const input = originalCreateElement('input');
  Object.defineProperty(input, 'click', {
    configurable: true,
    value: () => {
      input.onchange?.({
        target: {
          files,
        },
      } as any);
    },
  });

  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'input') {
      return input;
    }
    return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(isTauriRuntime).mockReturnValue(false);
});

function createDirectoryHandle(name: string, entries: any[]) {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const entry of entries) {
        yield entry;
      }
    },
  };
}

describe('fileSystem workspace helpers', () => {
  it('opens single markdown files through Tauri instead of the browser File System Access API', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(openNativeFile).mockResolvedValue({
      path: 'D:/docs/report.md',
      name: 'report.md',
      content: '# report',
    });
    const showOpenFilePicker = vi.fn();
    (window as any).showOpenFilePicker = showOpenFilePicker;

    await expect(openFile()).resolves.toEqual({
      fileHandle: {
        source: 'tauri-single-file',
        path: 'D:/docs/report.md',
        name: 'report.md',
      },
      content: '# report',
      name: 'report.md',
    });

    expect(openNativeFile).toHaveBeenCalledTimes(1);
    expect(showOpenFilePicker).not.toHaveBeenCalled();
  });

  it('writes single Tauri file handles through native file write without createWritable prompts', async () => {
    await writeFile(
      {
        source: 'tauri-single-file',
        path: 'D:/docs/report.md',
        name: 'report.md',
        createWritable: vi.fn(),
      },
      '# updated'
    );

    expect(writeNativeFile).toHaveBeenCalledWith('D:/docs/report.md', '# updated');
  });

  it('opens a native Tauri workspace when running in Tauri', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(openNativeWorkspace).mockResolvedValue({
      id: 'D:/docs',
      name: 'docs',
      rootPath: 'D:/docs',
      writable: true,
      entries: [{ id: 'README.md', kind: 'file', name: 'README.md', path: 'README.md' }],
    });

    await expect(openDirectory()).resolves.toMatchObject({
      name: 'docs',
      writable: true,
      source: 'tauri',
      entries: [
        {
          id: 'README.md',
          kind: 'file',
          name: 'README.md',
          path: 'README.md',
          handle: {
            source: 'tauri-file',
            workspaceId: 'D:/docs',
            path: 'README.md',
            name: 'README.md',
          },
        },
      ],
    });
  });

  it('restores a native Tauri workspace with hydrated handles', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(restoreRecentNativeWorkspace).mockResolvedValue({
      id: 'D:/docs',
      name: 'docs',
      rootPath: 'D:/docs',
      writable: true,
      entries: [{ id: 'README.md', kind: 'file', name: 'README.md', path: 'README.md' }],
    });

    await expect(restoreNativeWorkspace()).resolves.toMatchObject({
      name: 'docs',
      writable: true,
      source: 'tauri',
      entries: [
        {
          id: 'README.md',
          kind: 'file',
          name: 'README.md',
          path: 'README.md',
          handle: {
            source: 'tauri-file',
            workspaceId: 'D:/docs',
            path: 'README.md',
            name: 'README.md',
          },
        },
      ],
    });
  });

  it('returns recursive file and folder metadata for directory handles', async () => {
    const docsHandle = createDirectoryHandle('docs', [
      {
        kind: 'file',
        name: 'guide.md',
        getFile: vi.fn(),
      },
      {
        kind: 'file',
        name: 'notes.txt',
        getFile: vi.fn(),
      },
    ]);

    const rootHandle = createDirectoryHandle('workspace', [
      docsHandle,
      {
        kind: 'file',
        name: 'README.md',
        getFile: vi.fn(),
      },
      {
        kind: 'file',
        name: 'package.json',
        getFile: vi.fn(),
      },
    ]);

    const entries = await readWorkspaceEntries(rootHandle);

    expect(entries).toEqual([
      {
        id: 'docs',
        kind: 'directory',
        name: 'docs',
        path: 'docs',
        handle: docsHandle,
        children: [
          {
            id: 'docs/guide.md',
            kind: 'file',
            name: 'guide.md',
            path: 'docs/guide.md',
            handle: expect.any(Object),
          },
        ],
      },
      {
        id: 'README.md',
        kind: 'file',
        name: 'README.md',
        path: 'README.md',
        handle: expect.any(Object),
      },
    ]);
  });

  it('returns null for an empty fallback file selection', async () => {
    mockInputSelection([]);

    const originalPicker = (window as any).showDirectoryPicker;
    (window as any).showDirectoryPicker = undefined;

    try {
      await expect(openDirectory()).resolves.toBeNull();
    } finally {
      (window as any).showDirectoryPicker = originalPicker;
    }
  });

  it('builds fallback workspace metadata without pretending write support exists', async () => {
    const readme = new File(['# readme'], 'README.md', { type: 'text/markdown' });
    Object.defineProperty(readme, 'webkitRelativePath', {
      configurable: true,
      value: 'workspace/README.md',
    });

    const guide = new File(['# guide'], 'guide.md', { type: 'text/markdown' });
    Object.defineProperty(guide, 'webkitRelativePath', {
      configurable: true,
      value: 'workspace/docs/guide.md',
    });

    const image = new File(['binary'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(image, 'webkitRelativePath', {
      configurable: true,
      value: 'workspace/assets/logo.png',
    });

    mockInputSelection([readme, guide, image]);

    const originalPicker = (window as any).showDirectoryPicker;
    (window as any).showDirectoryPicker = undefined;

    try {
      const result = await openDirectory();

      expect(result).toEqual({
        name: 'workspace',
        directoryHandle: null,
        writable: false,
        source: 'input-fallback',
        entries: [
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
                file: guide,
              },
            ],
          },
          {
            id: 'README.md',
            kind: 'file',
            name: 'README.md',
            path: 'README.md',
            file: readme,
          },
        ],
      });
    } finally {
      (window as any).showDirectoryPicker = originalPicker;
    }
  });
});
