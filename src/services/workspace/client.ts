import { getNativeInvoke, isTauriRuntime } from '../native';
import type { NativeFile, NativeRecentWorkspace, NativeWorkspace } from './types';

function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('Native workspace service is only available in Tauri runtime');
  }
}

export async function openNativeWorkspace(): Promise<NativeWorkspace | null> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<NativeWorkspace | null>('workspace_pick_open');
}

export async function openNativeFile(): Promise<NativeFile | null> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<NativeFile | null>('file_pick_open');
}

export async function readNativeFile(path: string): Promise<string> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<string>('file_read', { payload: { path } });
}

export async function writeNativeFile(path: string, content: string): Promise<void> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('file_write', { payload: { path, content } });
}

export async function writeNativeFileAsset(
  filePath: string,
  relativePath: string,
  bytes: Uint8Array
): Promise<{ relativePath: string }> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<{ relativePath: string }>('file_write_asset', {
    payload: { filePath, relativePath, bytes: Array.from(bytes) },
  });
}

export async function restoreRecentNativeWorkspace(): Promise<NativeWorkspace | null> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<NativeWorkspace | null>('workspace_restore_recent');
}

export async function listRecentNativeWorkspaces(): Promise<NativeRecentWorkspace[]> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<NativeRecentWorkspace[]>('workspace_recent_list');
}

export async function clearRecentNativeWorkspaces(): Promise<void> {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_recent_clear');
}

export async function listNativeWorkspaceEntries(workspaceId: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<NativeWorkspace['entries']>('workspace_list_entries', { workspaceId });
}

export async function readNativeWorkspaceFile(workspaceId: string, path: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  return await invoke<string>('workspace_read_file', {
    payload: { workspaceId, path },
  });
}

export async function writeNativeWorkspaceFile(workspaceId: string, path: string, content: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_write_file', {
    payload: { workspaceId, path, content },
  });
}

export async function createNativeWorkspaceDirectory(workspaceId: string, path: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_create_directory', {
    payload: { workspaceId, path },
  });
}

export async function renameNativeWorkspaceEntry(workspaceId: string, fromPath: string, toPath: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_rename_entry', {
    payload: { workspaceId, fromPath, toPath },
  });
}

export async function deleteNativeWorkspaceEntry(workspaceId: string, path: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_delete_entry', {
    payload: { workspaceId, path },
  });
}

export async function revealNativeWorkspaceEntry(workspaceId: string, path: string) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_reveal_entry', {
    payload: { workspaceId, path },
  });
}

export async function writeNativeWorkspaceBinary(workspaceId: string, path: string, bytes: Uint8Array) {
  assertTauriRuntime();
  const invoke = getNativeInvoke();
  await invoke<void>('workspace_write_binary', {
    payload: { workspaceId, path, bytes: Array.from(bytes) },
  });
}
