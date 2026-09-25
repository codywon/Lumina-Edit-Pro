import { describe, expect, it } from 'vitest';
import {
  createNativeFileHandle,
  createNativeWorkspaceDirectoryHandle,
  createNativeWorkspaceFileHandle,
  isNativeFileHandle,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
} from './nativeHandle';

describe('native workspace handles', () => {
  it('identifies native directory handles', () => {
    const handle = createNativeWorkspaceDirectoryHandle({
      id: 'workspace-id',
      name: 'workspace',
      rootPath: 'D:/workspace',
    });

    expect(isNativeWorkspaceDirectoryHandle(handle)).toBe(true);
    expect(isNativeWorkspaceFileHandle(handle)).toBe(false);
  });

  it('identifies native file handles', () => {
    const handle = createNativeWorkspaceFileHandle('workspace-id', 'docs/a.md', 'a.md');

    expect(isNativeWorkspaceFileHandle(handle)).toBe(true);
    expect(isNativeWorkspaceDirectoryHandle(handle)).toBe(false);
    expect(isNativeFileHandle(handle)).toBe(false);
  });

  it('identifies single native file handles', () => {
    const handle = createNativeFileHandle('D:/workspace/a.md', 'a.md');

    expect(isNativeFileHandle(handle)).toBe(true);
    expect(isNativeWorkspaceFileHandle(handle)).toBe(false);
    expect(isNativeWorkspaceDirectoryHandle(handle)).toBe(false);
  });
});
