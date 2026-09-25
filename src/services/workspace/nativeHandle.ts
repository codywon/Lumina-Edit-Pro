import type { NativeFileHandle, NativeWorkspaceDirectoryHandle, NativeWorkspaceFileHandle } from './types';

export function createNativeWorkspaceDirectoryHandle(workspace: {
  id: string;
  name: string;
  rootPath: string;
}): NativeWorkspaceDirectoryHandle {
  return {
    source: 'tauri',
    workspaceId: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
  };
}

export function createNativeWorkspaceFileHandle(
  workspaceId: string,
  path: string,
  name: string
): NativeWorkspaceFileHandle {
  return {
    source: 'tauri-file',
    workspaceId,
    path,
    name,
  };
}

export function createNativeFileHandle(path: string, name: string): NativeFileHandle {
  return {
    source: 'tauri-single-file',
    path,
    name,
  };
}

export function isNativeWorkspaceDirectoryHandle(value: unknown): value is NativeWorkspaceDirectoryHandle {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as any).source === 'tauri' &&
      typeof (value as any).workspaceId === 'string' &&
      typeof (value as any).name === 'string' &&
      typeof (value as any).rootPath === 'string'
  );
}

export function isNativeWorkspaceFileHandle(value: unknown): value is NativeWorkspaceFileHandle {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as any).source === 'tauri-file' &&
      typeof (value as any).workspaceId === 'string' &&
      typeof (value as any).path === 'string' &&
      typeof (value as any).name === 'string'
  );
}

export function isNativeFileHandle(value: unknown): value is NativeFileHandle {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as any).source === 'tauri-single-file' &&
      typeof (value as any).path === 'string' &&
      typeof (value as any).name === 'string'
  );
}
