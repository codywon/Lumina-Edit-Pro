import { isTauriRuntime } from '../services/native';
import {
  createNativeWorkspaceDirectoryHandle,
  createNativeFileHandle,
  createNativeWorkspaceFileHandle,
  isNativeFileHandle,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
  listNativeWorkspaceEntries,
  openNativeFile,
  openNativeWorkspace,
  readNativeFile,
  readNativeWorkspaceFile,
  restoreRecentNativeWorkspace,
  writeNativeFile,
  writeNativeWorkspaceFile,
} from '../services/workspace';

export type WorkspaceSource = 'file-system-access' | 'input-fallback' | 'tauri';

let lastOpenDirectoryError: string | null = null;

export function getLastOpenDirectoryError() {
  const error = lastOpenDirectoryError;
  lastOpenDirectoryError = null;
  return error;
}

export interface WorkspaceFileEntry {
  id: string;
  kind: 'file';
  name: string;
  path: string;
  handle?: any;
  file?: File;
}

export interface WorkspaceDirectoryEntry {
  id: string;
  kind: 'directory';
  name: string;
  path: string;
  handle?: any;
  children: WorkspaceEntry[];
}

export type WorkspaceEntry = WorkspaceFileEntry | WorkspaceDirectoryEntry;

export interface OpenDirectoryResult {
  name: string;
  directoryHandle: any | null;
  entries: WorkspaceEntry[];
  writable: boolean;
  source: WorkspaceSource;
}

function attachNativeHandles(entries: WorkspaceEntry[], workspaceId: string): WorkspaceEntry[] {
  return entries.map((entry) => {
    if (entry.kind === 'directory') {
      return {
        ...entry,
        children: attachNativeHandles(entry.children, workspaceId),
      };
    }

    return {
      ...entry,
      handle: createNativeWorkspaceFileHandle(workspaceId, entry.path, entry.name),
    };
  });
}

function isMarkdownFileName(name: string) {
  return name.toLowerCase().endsWith('.md');
}

function sortWorkspaceEntries(entries: WorkspaceEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

async function collectDirectoryEntries(
  directoryHandle: any,
  parentPath = ''
): Promise<{ entries: WorkspaceEntry[]; rawEntryCount: number }> {
  const entries: WorkspaceEntry[] = [];
  let rawEntryCount = 0;

  for await (const entry of directoryHandle.values()) {
    rawEntryCount += 1;
    const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      const childResult = await collectDirectoryEntries(entry, entryPath);
      if (childResult.rawEntryCount === 0 || childResult.entries.length > 0) {
        entries.push({
          id: entryPath,
          kind: 'directory',
          name: entry.name,
          path: entryPath,
          handle: entry,
          children: childResult.entries,
        });
      }
      continue;
    }

    if (entry.kind === 'file' && isMarkdownFileName(entry.name)) {
      entries.push({
        id: entryPath,
        kind: 'file',
        name: entry.name,
        path: entryPath,
        handle: entry,
      });
    }
  }

  return {
    rawEntryCount,
    entries: sortWorkspaceEntries(entries).map((entry) =>
      entry.kind === 'directory'
        ? { ...entry, children: sortWorkspaceEntries(entry.children) }
        : entry
    ),
  };
}

function createDirectoryEntry(name: string, path: string): WorkspaceDirectoryEntry {
  return {
    id: path,
    kind: 'directory',
    name,
    path,
    children: [],
  };
}

function buildEntriesFromFallbackFiles(files: File[]) {
  const rootEntries: WorkspaceEntry[] = [];
  const directories = new Map<string, WorkspaceDirectoryEntry>();

  const ensureDirectory = (segments: string[]) => {
    let currentEntries = rootEntries;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let directory = directories.get(currentPath);

      if (!directory) {
        directory = createDirectoryEntry(segment, currentPath);
        directories.set(currentPath, directory);
        currentEntries.push(directory);
      }

      currentEntries = directory.children;
    }

    return currentEntries;
  };

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/').filter(Boolean);
    const relativeSegments = pathSegments.length > 1 ? pathSegments.slice(1) : pathSegments;
    const fileName = relativeSegments.at(-1);

    if (!fileName || !isMarkdownFileName(fileName)) {
      continue;
    }

    const parentSegments = relativeSegments.slice(0, -1);
    const parentEntries = ensureDirectory(parentSegments);
    const entryPath = relativeSegments.join('/');

    parentEntries.push({
      id: entryPath,
      kind: 'file',
      name: fileName,
      path: entryPath,
      file,
    });
  }

  const sortRecursively = (entries: WorkspaceEntry[]): WorkspaceEntry[] =>
    sortWorkspaceEntries(entries).map((entry) =>
      entry.kind === 'directory'
        ? { ...entry, children: sortRecursively(entry.children) }
        : entry
    );

  return sortRecursively(rootEntries);
}

function getFallbackWorkspaceName(files: File[]) {
  const firstFile = files[0] as (File & { webkitRelativePath?: string }) | undefined;
  const firstRelativePath = firstFile?.webkitRelativePath;
  if (firstRelativePath) {
    const [rootName] = firstRelativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (rootName) {
      return rootName;
    }
  }
  return '本地文件夹';
}

function countReplacementChars(text: string) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 0xfffd) {
      count += 1;
    }
  }
  return count;
}

async function decodeFileText(file: File) {
  try {
    const buffer = await file.arrayBuffer();
    const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const utf8ReplacementCount = countReplacementChars(utf8Text);

    if (utf8ReplacementCount === 0) {
      return utf8Text;
    }

    try {
      const gbkText = new TextDecoder('gbk', { fatal: false }).decode(buffer);
      const gbkReplacementCount = countReplacementChars(gbkText);
      return gbkReplacementCount <= utf8ReplacementCount ? gbkText : utf8Text;
    } catch {
      return utf8Text;
    }
  } catch {
    return await file.text();
  }
}

export async function readWorkspaceEntries(directoryHandle: any) {
  if (isNativeWorkspaceDirectoryHandle(directoryHandle)) {
    const entries = await listNativeWorkspaceEntries(directoryHandle.workspaceId);
    return attachNativeHandles(entries, directoryHandle.workspaceId);
  }

  if (!directoryHandle?.values) {
    return [];
  }

  const result = await collectDirectoryEntries(directoryHandle);
  return result.entries;
}

export async function openFile() {
  if (isTauriRuntime()) {
    const file = await openNativeFile();
    if (!file) {
      return null;
    }

    return {
      fileHandle: createNativeFileHandle(file.path, file.name),
      content: file.content,
      name: file.name,
    };
  }

  // Try File System Access API first, but skip if in an iframe
  if ((window as any).showOpenFilePicker && window.self === window.top) {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md'] },
        }],
      });
      const file = await fileHandle.getFile();
      const content = await decodeFileText(file);
      return { fileHandle, content, name: file.name };
    } catch (err) {
      console.error('Error opening file:', err);
    }
  }

  // Fallback to input element
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const content = await decodeFileText(file);
        resolve({ fileHandle: file, content, name: file.name });
      } else {
        resolve(null);
      }
    };
    input.click();
  });
}

export async function openDirectory(): Promise<OpenDirectoryResult | null> {
  lastOpenDirectoryError = null;

  if (isTauriRuntime()) {
    try {
      const workspace = await openNativeWorkspace();
      if (!workspace) return null;
      return {
        name: workspace.name,
        directoryHandle: createNativeWorkspaceDirectoryHandle(workspace),
        entries: attachNativeHandles(workspace.entries, workspace.id),
        writable: workspace.writable,
        source: 'tauri',
      };
    } catch (err) {
      console.error('Error opening native workspace:', err);
      lastOpenDirectoryError = (err as Error)?.message || '打开本地工作区失败';
      return null;
    }
  }

  const openWithInputFallback = () =>
    new Promise<OpenDirectoryResult | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      input.style.display = 'none';

      let didSelect = false;
      let resolved = false;
      let blockTimer: number | null = null;

      const cleanup = () => {
        window.removeEventListener('focus', handleFocus);
        if (blockTimer !== null) {
          window.clearTimeout(blockTimer);
          blockTimer = null;
        }
        input.remove();
      };

      const finalize = (result: OpenDirectoryResult | null) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      const handleFocus = () => {
        window.setTimeout(() => {
          if (!didSelect) {
            finalize(null);
          }
        }, 0);
      };

      window.addEventListener('focus', handleFocus, { once: true });

      input.onchange = (e) => {
        didSelect = true;
        const files = (e.target as HTMLInputElement).files;
        if (files) {
          const fileList = Array.from(files);
          if (fileList.length === 0) {
            finalize(null);
            return;
          }

          const result: OpenDirectoryResult = {
            name: getFallbackWorkspaceName(fileList),
            directoryHandle: null,
            entries: buildEntriesFromFallbackFiles(fileList),
            writable: false,
            source: 'input-fallback',
          };

          finalize(result);
          return;
        }

        finalize(null);
      };

      document.body.appendChild(input);
      input.click();

      blockTimer = window.setTimeout(() => {
        if (!didSelect && document.hasFocus()) {
          lastOpenDirectoryError = '浏览器阻止打开文件选择器';
          finalize(null);
        }
      }, 300);
    });

  // Try File System Access API first, but skip if in an iframe
  if ((window as any).showDirectoryPicker && window.self === window.top) {
    try {
      const directoryHandle = await (window as any).showDirectoryPicker();
      const entries = await readWorkspaceEntries(directoryHandle);
      return {
        name: directoryHandle.name,
        directoryHandle,
        entries,
        writable:
          typeof directoryHandle?.getFileHandle === 'function' &&
          typeof directoryHandle?.getDirectoryHandle === 'function',
        source: 'file-system-access',
      };
    } catch (err) {
      if ((err as DOMException | undefined)?.name === 'AbortError') {
        return null;
      }
      console.error('Error opening directory:', err);
      lastOpenDirectoryError = (err as Error)?.message || '打开工作区失败';
      const fallbackResult = await openWithInputFallback();
      if (fallbackResult) {
        lastOpenDirectoryError = null;
        return fallbackResult;
      }
      return null;
    }
  }

  // Fallback to input element
  return await openWithInputFallback();
}

export async function restoreNativeWorkspace(): Promise<OpenDirectoryResult | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const workspace = await restoreRecentNativeWorkspace();
  if (!workspace) {
    return null;
  }

  return {
    name: workspace.name,
    directoryHandle: createNativeWorkspaceDirectoryHandle(workspace),
    entries: attachNativeHandles(workspace.entries, workspace.id),
    writable: workspace.writable,
    source: 'tauri',
  };
}

export async function readFile(fileHandle: any) {
  if (isNativeFileHandle(fileHandle)) {
    return await readNativeFile(fileHandle.path);
  }

  if (isNativeWorkspaceFileHandle(fileHandle)) {
    return await readNativeWorkspaceFile(fileHandle.workspaceId, fileHandle.path);
  }

  if (fileHandle && typeof fileHandle.getFile === 'function') {
    const file = await fileHandle.getFile();
    return await decodeFileText(file);
  }

  if (fileHandle instanceof File) {
    return await decodeFileText(fileHandle);
  }

  if (typeof fileHandle?.text === 'function') {
    return await fileHandle.text();
  }

  return '';
}


export async function openImageFile() {
  const imageTypes = {
    'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
  };

  // Try File System Access API first, but skip if in an iframe
  if ((window as any).showOpenFilePicker && window.self === window.top) {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'Image Files',
          accept: imageTypes,
        }],
        multiple: false,
      });
      const file = await fileHandle.getFile();
      return file;
    } catch (err) {
      console.error('Error opening image file:', err);
    }
  }

  // Fallback to input element
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0] ?? null;
      resolve(file);
    };
    input.click();
  });
}

export async function writeFile(fileHandle: any, content: string) {
  if (isNativeFileHandle(fileHandle)) {
    await writeNativeFile(fileHandle.path, content);
    return;
  }

  if (isNativeWorkspaceFileHandle(fileHandle)) {
    await writeNativeWorkspaceFile(fileHandle.workspaceId, fileHandle.path, content);
    return;
  }

  if (fileHandle && typeof fileHandle.createWritable === 'function') {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  } else {
    // Fallback: trigger download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileHandle?.name || 'Lumina-Document.md';
    a.click();
    URL.revokeObjectURL(url);
  }
}
