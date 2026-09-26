import { toPng, toBlob } from 'html-to-image';
import { saveExportedBytes } from './exportSave';

/**
 * Filter function to skip non-printable or UI overlay nodes during rasterization.
 */
function imageExportFilter(node: HTMLElement): boolean {
  if (!node || !node.classList) return true;
  if (
    node.classList.contains('print-hide') ||
    node.classList.contains('ai-panel') ||
    node.classList.contains('sidebar') ||
    node.getAttribute('role') === 'dialog'
  ) {
    return false;
  }
  return true;
}

/**
 * Render document DOM element to a high-resolution long image (PNG)
 * Uses html-to-image with automatic font embedding, image inlining & Retina 2x scale.
 */
export async function exportElementToLongImage(
  element: HTMLElement,
  fileName = 'Lumina-Document.png',
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void
): Promise<void> {
  try {
    showToast?.('正在生成高清长图，请稍候…', 'info');

    const isDark = document.documentElement.classList.contains('dark');
    const backgroundColor = isDark ? '#121214' : '#ffffff';

    const width = Math.max(element.scrollWidth, 800);
    const height = Math.max(element.scrollHeight, 600);

    // High quality 2x Retina configuration
    const options = {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor,
      width,
      height,
      filter: imageExportFilter as (domNode: HTMLElement) => boolean,
      style: {
        transform: 'none',
        margin: '0',
        padding: '32px',
        boxSizing: 'border-box',
        background: backgroundColor,
      },
      // Skip problematic external cross-origin webfonts if unavailable
      skipFonts: false,
    };

    let pngBlob: Blob | null = null;

    try {
      pngBlob = await toBlob(element, options);
    } catch (primaryErr) {
      console.warn('html-to-image with fonts failed, retrying with skipFonts: true', primaryErr);
      // Fallback: retry with local fonts without waiting on network font resources
      pngBlob = await toBlob(element, { ...options, skipFonts: true });
    }

    if (!pngBlob) {
      // Fallback 2: try toPng data URL if blob generation failed
      const dataUrl = await toPng(element, { ...options, skipFonts: true });
      const res = await fetch(dataUrl);
      pngBlob = await res.blob();
    }

    if (!pngBlob) {
      throw new Error('Canvas blob generation produced null');
    }

    const arrayBuf = await pngBlob.arrayBuffer();
    await saveExportedBytes({
      bytes: new Uint8Array(arrayBuf),
      defaultFileName: fileName.endsWith('.png') ? fileName : `${fileName}.png`,
      filterName: 'PNG 高清长图 (*.png)',
      extensions: ['png'],
      mimeType: 'image/png',
      showToast,
      successLabel: '高清长图',
    });
  } catch (error) {
    console.error('Long image export error:', error);
    showToast?.('长图生成失败，可尝试使用“导出为 HTML 或打印为 PDF”', 'error');
  }
}
