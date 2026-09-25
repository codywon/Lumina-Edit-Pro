import type { WorkspaceEntry } from '../../lib/fileSystem';

export interface NativeWorkspace {
  id: string;
  name: string;
  rootPath: string;
  entries: WorkspaceEntry[];
  writable: boolean;
}

export interface NativeWorkspaceDirectoryHandle {
  source: 'tauri';
  workspaceId: string;
  name: string;
  rootPath: string;
}

export interface NativeWorkspaceFileHandle {
  source: 'tauri-file';
  workspaceId: string;
  path: string;
  name: string;
}

export interface NativeFile {
  path: string;
  name: string;
  content: string;
}

export interface NativeFileHandle {
  source: 'tauri-single-file';
  path: string;
  name: string;
}

export interface NativeRecentWorkspace {
  id: string;
  name: string;
  rootPath: string;
  lastOpenedAt: number;
}
