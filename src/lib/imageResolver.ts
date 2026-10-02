import { isTauriRuntime } from '../services/native';
import { getNativeInvoke } from '../services/native/invoke';

// Stores active document & workspace directory paths
let currentWorkspaceRoot: string | null = null;
let currentDocumentDir: string | null = null;

export function setActiveDocumentPathInfo(info: {
  workspaceRoot?: string | null;
  documentDir?: string | null;
}) {
  currentWorkspaceRoot = info.workspaceRoot ? normalizePath(info.workspaceRoot) : null;
  currentDocumentDir = info.documentDir ? normalizePath(info.documentDir) : null;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lumina:document-path-changed'));
  }
}

export function getActiveDocumentPathInfo() {
  return {
    workspaceRoot: currentWorkspaceRoot,
    documentDir: currentDocumentDir,
  };
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Determine candidate absolute filesystem paths for a relative image path
 */
export function getCandidateAbsolutePaths(src: string): string[] {
  const cleanSrc = src.trim().replace(/\\/g, '/');
  if (
    cleanSrc.startsWith('data:') ||
    cleanSrc.startsWith('blob:') ||
    cleanSrc.startsWith('http://') ||
    cleanSrc.startsWith('https://') ||
    cleanSrc.startsWith('asset://')
  ) {
    return [];
  }

  // If already absolute on Windows (e.g. D:/path or D:\path) or Unix (/path)
  if (/^[a-zA-Z]:[/\\]/.test(cleanSrc) || cleanSrc.startsWith('/')) {
    return [cleanSrc.replace(/\\/g, '/')];
  }

  // Relative path: strip leading ./
  const rel = cleanSrc.replace(/^\.\//, '');
  const candidates: string[] = [];

  if (currentDocumentDir) {
    candidates.push(`${currentDocumentDir}/${rel}`);
  }

  if (currentWorkspaceRoot && currentWorkspaceRoot !== currentDocumentDir) {
    candidates.push(`${currentWorkspaceRoot}/${rel}`);
  }

  return candidates;
}

/**
 * Resolve a markdown image src into a displayable URL in the current environment
 */
export function resolveImageSrc(src: string): string {
  if (!src) return '';
  const clean = src.trim();

  // If already absolute web/data/blob/asset URL, return directly
  if (
    clean.startsWith('data:') ||
    clean.startsWith('blob:') ||
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('asset://')
  ) {
    return clean;
  }

  const candidates = getCandidateAbsolutePaths(clean);
  if (candidates.length === 0) {
    return clean;
  }

  const primaryPath = candidates[0];

  if (isTauriRuntime() && typeof window !== 'undefined') {
    // In Tauri, use Tauri's convertFileSrc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    if (internals && typeof internals.convertFileSrc === 'function') {
      try {
        return internals.convertFileSrc(primaryPath, 'asset');
      } catch (err) {
        console.warn('[imageResolver] convertFileSrc error:', err);
      }
    }
  }

  return clean;
}

/**
 * Infallible fallback: reads the binary bytes of an image from disk via Rust and returns a Base64 data URL
 */
export async function readLocalImageBase64(src: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;

  const candidates = getCandidateAbsolutePaths(src);
  if (candidates.length === 0) return null;

  const invoke = getNativeInvoke();

  for (const absPath of candidates) {
    try {
      const dataUrl = await invoke<string>('app_read_asset_data_url', {
        payload: { path: absPath },
      });
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        return dataUrl;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}
