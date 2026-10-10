import { networkDownloadAsset } from '../../services/native';
import { writeNativeFileAsset, writeNativeWorkspaceBinary } from '../../services/workspace';
import type { AssetLocalizationResult, LocalizedAssetInfo, LocalizeAssetsOptions } from './types';

/**
 * Extract all remote HTTP/HTTPS image URLs from Markdown or HTML image tags
 */
export function extractImageUrls(markdown: string): string[] {
  const urls = new Set<string>();

  // 1. Markdown syntax: ![alt](url "title") or ![alt](url)
  const mdImgRegex = /!\[.*?\]\(\s*(https?:\/\/[^\s\)]+)(?:\s+["'].*?["'])?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = mdImgRegex.exec(markdown)) !== null) {
    if (match[1]) {
      urls.add(match[1].trim());
    }
  }

  // 2. HTML syntax: <img ... src="url" ... />
  const htmlImgRegex = /<img\b[^>]*?\bsrc=["'](https?:\/\/[^"'\s>]+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(markdown)) !== null) {
    if (match[1]) {
      urls.add(match[1].trim());
    }
  }

  return Array.from(urls);
}

/**
 * Compute SHA-256 hash string for binary bytes (portable across browser, Node, and Web Crypto)
 */
export async function computeSha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }

  // Fallback hash
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
}

/**
 * Infer correct image file extension from Content-Type or URL parameters
 */
export function getExtensionFromContentType(contentType: string, url: string): string {
  const cleanType = (contentType || '').toLowerCase().split(';')[0].trim();
  switch (cleanType) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    case 'image/bmp':
      return '.bmp';
    case 'image/avif':
      return '.avif';
    default:
      // Try from URL query params (e.g. wx_fmt=png or tp=webp)
      try {
        const parsed = new URL(url);
        const wxFmt = parsed.searchParams.get('wx_fmt') || parsed.searchParams.get('tp') || parsed.searchParams.get('format');
        if (wxFmt) {
          const lowerFmt = wxFmt.toLowerCase();
          if (lowerFmt === 'jpeg' || lowerFmt === 'jpg') return '.jpg';
          return `.${lowerFmt}`;
        }
        const pathname = parsed.pathname;
        const lastDot = pathname.lastIndexOf('.');
        if (lastDot !== -1) {
          const ext = pathname.slice(lastDot).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif'].includes(ext)) {
            return ext === '.jpeg' ? '.jpg' : ext;
          }
        }
      } catch {
        // invalid URL
      }
      return '.png';
  }
}

/**
 * Localize all remote images in a Markdown document into the workspace / file's .assets directory
 */
export async function localizeMarkdownAssets(
  markdown: string,
  options: LocalizeAssetsOptions = {}
): Promise<AssetLocalizationResult> {
  const urls = extractImageUrls(markdown);
  if (urls.length === 0) {
    return {
      markdown,
      localizedCount: 0,
      failedCount: 0,
      assets: [],
    };
  }

  const assetsDir = options.assetsDirName || '.assets';
  const localizedAssets: LocalizedAssetInfo[] = [];
  const replacements = new Map<string, string>();
  let failedCount = 0;

  // Process downloads in small concurrent batches (e.g. max 4 at a time to prevent rate limits)
  const CONCURRENCY = 4;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const chunk = urls.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (remoteUrl, chunkIdx) => {
        const globalIndex = i + chunkIdx;
        options.onProgress?.(globalIndex + 1, urls.length, remoteUrl);

        try {
          const headers: Record<string, string> = {};
          if (options.referer) {
            headers.Referer = options.referer;
          } else if (remoteUrl.includes('qpic.cn') || remoteUrl.includes('weixin.qq.com')) {
            headers.Referer = 'https://mp.weixin.qq.com/';
          } else if (remoteUrl.includes('xiaohongshu.com') || remoteUrl.includes('xhscdn.com')) {
            headers.Referer = 'https://www.xiaohongshu.com/';
          } else if (remoteUrl.includes('zhimg.com') || remoteUrl.includes('zhihu.com')) {
            headers.Referer = 'https://www.zhihu.com/';
          }

          const downloadRes = await networkDownloadAsset({
            url: remoteUrl,
            headers,
          });

          if (!downloadRes.bytes || downloadRes.bytes.length === 0) {
            failedCount++;
            return;
          }

          const rawBytes = new Uint8Array(downloadRes.bytes);
          const hash = await computeSha256(rawBytes);
          const shortHash = hash.slice(0, 10);
          const ext = getExtensionFromContentType(downloadRes.contentType, remoteUrl);
          const fileName = `img-${shortHash}${ext}`;
          const relativeAssetPath = `${assetsDir}/${fileName}`;
          const markdownRelativeRef = `./${assetsDir}/${fileName}`;

          // Persist the binary bytes
          if (options.workspaceId) {
            await writeNativeWorkspaceBinary(options.workspaceId, relativeAssetPath, rawBytes);
          } else if (options.documentFilePath) {
            await writeNativeFileAsset(options.documentFilePath, relativeAssetPath, rawBytes);
          } else if (options.customSaveBinary) {
            await options.customSaveBinary(relativeAssetPath, rawBytes);
          } else {
            // Web / in-memory fallback: convert to base64 Data URL so the image remains visible
            let base64 = '';
            if (typeof Buffer !== 'undefined') {
              base64 = Buffer.from(rawBytes).toString('base64');
            } else {
              let binary = '';
              const chunkSize = 8192;
              for (let b = 0; b < rawBytes.length; b += chunkSize) {
                const sub = rawBytes.subarray(b, b + chunkSize);
                binary += String.fromCharCode.apply(null, Array.from(sub));
              }
              base64 = btoa(binary);
            }
            const mime = downloadRes.contentType.split(';')[0] || 'image/png';
            const dataUrl = `data:${mime};base64,${base64}`;
            replacements.set(remoteUrl, dataUrl);
            localizedAssets.push({
              remoteUrl,
              localPath: dataUrl,
              size: rawBytes.length,
            });
            return;
          }

          replacements.set(remoteUrl, markdownRelativeRef);
          localizedAssets.push({
            remoteUrl,
            localPath: markdownRelativeRef,
            size: rawBytes.length,
          });
        } catch (err) {
          console.warn(`[AssetLocalizer] Failed to download asset: ${remoteUrl}`, err);
          failedCount++;
        }
      })
    );
  }

  // Replace all occurrences in markdown safely
  let updatedMarkdown = markdown;
  for (const [remoteUrl, localPath] of replacements.entries()) {
    // Replace markdown image syntax ![alt](remoteUrl)
    updatedMarkdown = updatedMarkdown.split(remoteUrl).join(localPath);
  }

  return {
    markdown: updatedMarkdown,
    localizedCount: localizedAssets.length,
    failedCount,
    assets: localizedAssets,
  };
}
