import { isTauriRuntime } from '../services/native/environment';
import { getNativeInvoke } from '../services/native/invoke';

/**
 * Extract a clean base filename from the first Markdown heading (e.g. `# 酒店雷达系统对接接口文档` -> `酒店雷达系统对接接口文档`)
 */
export function extractDocumentBaseName(markdown: string, fallback = 'Lumina-Document'): string {
  if (!markdown) return fallback;
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Markdown heading: # Title
    const mdMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (mdMatch && mdMatch[1]) {
      const cleaned = mdMatch[1]
        .replace(/[*_`~[\]()<>]/g, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim();
      if (cleaned.length > 0) {
        return cleaned.slice(0, 60);
      }
    }
    // HTML heading: <h1>Title</h1>
    const htmlMatch = trimmed.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    if (htmlMatch && htmlMatch[1]) {
      const cleaned = htmlMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/[*_`~[\]()<>]/g, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim();
      if (cleaned.length > 0) {
        return cleaned.slice(0, 60);
      }
    }
  }
  return fallback;
}

export interface SaveExportOptions {
  bytes: Uint8Array;
  defaultFileName: string;
  filterName: string;
  extensions: string[];
  mimeType: string;
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void;
  successLabel?: string;
}

/**
 * Pop up the native OS "Save As..." dialog (in Tauri desktop or File System Access API)
 * and write the exported bytes directly to the chosen path.
 */
export async function saveExportedBytes(options: SaveExportOptions): Promise<boolean> {
  const {
    bytes,
    defaultFileName,
    filterName,
    extensions,
    mimeType,
    showToast,
    successLabel = '文件',
  } = options;

  // 1. Native Tauri Desktop Save Dialog ("另存为...")
  if (isTauriRuntime()) {
    try {
      const invoke = getNativeInvoke();
      const savedPath = await invoke<string | null>('file_export_save', {
        payload: {
          defaultName: defaultFileName,
          filterName,
          extensions,
          bytes: Array.from(bytes),
        },
      });

      if (savedPath) {
        showToast?.(`已成功导出${successLabel}至：${savedPath}`, 'info');
        return true;
      }
      // User cancelled the Save As dialog
      return false;
    } catch (err) {
      console.error('Tauri file_export_save failed, falling back to browser download:', err);
    }
  }

  // 2. Modern Browser File System Access API (showSaveFilePicker)
  const win = window as any;
  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: defaultFileName,
        types: [
          {
            description: filterName,
            accept: { [mimeType]: extensions.map((ext) => `.${ext}`) },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      showToast?.(`已成功导出${successLabel}：${handle.name || defaultFileName}`, 'info');
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return false;
      }
      console.warn('showSaveFilePicker failed, falling back to anchor download:', err);
    }
  }

  // 3. Fallback Browser Download
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast?.(`已成功导出${successLabel}：${defaultFileName}`, 'info');
  return true;
}
