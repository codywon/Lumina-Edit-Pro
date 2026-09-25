import { saveExportedBytes } from './exportSave';

/**
 * Render document DOM element to a high-resolution long image (PNG)
 * Uses SVG foreignObject rasterization technique (100% native, 0 external bloat).
 */
export async function exportElementToLongImage(
  element: HTMLElement,
  fileName = 'Lumina-Document.png',
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void
): Promise<void> {
  try {
    showToast?.('正在生成高清长图，请稍候…', 'info');

    const width = Math.max(element.scrollWidth, 800);
    const height = Math.max(element.scrollHeight, 600);

    // Deep clone the element to sanitize styles
    const clone = element.cloneNode(true) as HTMLElement;

    // Collect all computed stylesheets into an inline style tag
    let cssText = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        for (let j = 0; j < sheet.cssRules.length; j++) {
          cssText += sheet.cssRules[j].cssText + '\n';
        }
      } catch {
        // Cross-origin sheets can be safely ignored
      }
    }

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.width = `${width}px`;
    wrapper.style.minHeight = `${height}px`;
    wrapper.style.background = document.documentElement.classList.contains('dark') ? '#121212' : '#ffffff';
    wrapper.style.color = document.documentElement.classList.contains('dark') ? '#e6edf3' : '#1f2328';
    wrapper.style.padding = '40px';
    wrapper.style.boxSizing = 'border-box';
    wrapper.appendChild(clone);

    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <style>${cssText}</style>
        <foreignObject width="100%" height="100%">
          ${new XMLSerializer().serializeToString(wrapper)}
        </foreignObject>
      </svg>
    `;

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = 2; // 2x Retina resolution
          canvas.width = width * scale;
          canvas.height = height * scale;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Cannot create Canvas 2D context'));
            return;
          }

          ctx.scale(scale, scale);
          ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#121212' : '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);

          canvas.toBlob(async (pngBlob) => {
            if (!pngBlob) {
              reject(new Error('Failed to create PNG blob'));
              return;
            }
            URL.revokeObjectURL(blobURL);
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
            resolve();
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };

      image.onerror = (err) => {
        URL.revokeObjectURL(blobURL);
        reject(err);
      };

      image.src = blobURL;
    });
  } catch (error) {
    console.error('Long image export error:', error);
    showToast?.('长图生成失败，可尝试使用“导出为 HTML 或打印为 PDF”', 'error');
  }
}
