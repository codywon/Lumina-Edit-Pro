import { afterEach, describe, expect, it, vi } from 'vitest';

import { openNativeFile, openNativeWorkspace, writeNativeFile } from './client';
import { isTauriRuntime } from '../native';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('../native', () => ({
  getNativeInvoke: vi.fn(() => mockInvoke),
  isTauriRuntime: vi.fn(() => true),
}));

describe('native workspace client', () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    vi.clearAllMocks();
    vi.mocked(isTauriRuntime).mockReturnValue(true);
  });

  it('opens workspaces through the native Rust picker command', async () => {
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };
    const workspace = {
      id: 'D:/docs',
      name: 'docs',
      rootPath: 'D:/docs',
      writable: true,
      entries: [],
    };
    mockInvoke.mockResolvedValue(workspace);

    await expect(openNativeWorkspace()).resolves.toBe(workspace);

    expect(mockInvoke).toHaveBeenCalledWith('workspace_pick_open');
  });

  it('opens and writes single markdown files through native Rust commands', async () => {
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };
    const file = {
      path: 'D:/docs/report.md',
      name: 'report.md',
      content: '# report',
    };
    mockInvoke.mockResolvedValueOnce(file).mockResolvedValueOnce(undefined);

    await expect(openNativeFile()).resolves.toBe(file);
    await writeNativeFile('D:/docs/report.md', '# updated');

    expect(mockInvoke).toHaveBeenCalledWith('file_pick_open');
    expect(mockInvoke).toHaveBeenCalledWith('file_write', {
      payload: { path: 'D:/docs/report.md', content: '# updated' },
    });
  });
});
