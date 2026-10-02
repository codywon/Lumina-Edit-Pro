import { FeishuAdapter } from './adapters/feishu';
import { GenericWebAdapter } from './adapters/generic';
import { WechatAdapter } from './adapters/wechat';
import { XiaohongshuAdapter } from './adapters/xiaohongshu';
import { localizeMarkdownAssets } from './assetLocalizer';
import { parseHtmlToDocument } from './domHelper';
import { buildFrontmatter } from './frontmatter';
import { convertHtmlToMarkdown } from './htmlToMarkdown';
import type {
  AssetLocalizationResult,
  ExtractedArticle,
  KnowledgeAdapter,
  KnowledgeMetadata,
  KnowledgePlatform,
  LocalizeAssetsOptions,
} from './types';

export * from './types';
export * from './assetLocalizer';
export * from './htmlToMarkdown';
export * from './frontmatter';
export { WechatAdapter, XiaohongshuAdapter, FeishuAdapter, GenericWebAdapter };

const adapters: KnowledgeAdapter[] = [
  new WechatAdapter(),
  new XiaohongshuAdapter(),
  new FeishuAdapter(),
  new GenericWebAdapter(), // fallback for all standard URLs
];

/**
 * Detect which platform a given URL belongs to
 */
export function detectPlatform(url: string): KnowledgePlatform {
  if (!url) return 'generic';
  for (const adapter of adapters) {
    if (adapter.platform !== 'generic' && adapter.canHandle(url)) {
      return adapter.platform;
    }
  }
  return 'generic';
}

/**
 * Get human-readable label for a platform
 */
export function getPlatformLabel(platform: KnowledgePlatform): string {
  switch (platform) {
    case 'wechat':
      return '微信公众号';
    case 'xiaohongshu':
      return '小红书';
    case 'feishu':
      return '飞书文档';
    case 'generic':
      return '通用网页';
  }
}

/**
 * Extract article from URL using the most suitable adapter
 */
export async function extractArticleFromUrl(url: string, rawHtml?: string): Promise<ExtractedArticle> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('请输入有效的网页链接');
  }

  for (const adapter of adapters) {
    if (adapter.canHandle(cleanUrl)) {
      return await adapter.extract(cleanUrl, rawHtml);
    }
  }

  throw new Error(`无法识别该链接对应的解析适配器: ${cleanUrl}`);
}

/**
 * Extract article from raw HTML content (e.g. copied from browser, DevTools, or desktop client)
 */
export function extractArticleFromHtml(
  rawHtml: string,
  options: { sourceUrl?: string; platform?: KnowledgePlatform; fallbackTitle?: string } = {}
): ExtractedArticle {
  const cleanHtml = rawHtml.trim();
  if (!cleanHtml) {
    throw new Error('HTML 内容为空');
  }

  const doc = parseHtmlToDocument(cleanHtml);
  const platform = options.platform || (options.sourceUrl ? detectPlatform(options.sourceUrl) : 'generic');

  const title =
    doc.querySelector('#activity-name')?.textContent?.trim() ||
    doc.querySelector('.docx-title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.title?.replace(/- 微信公众平台$/, '').trim() ||
    options.fallbackTitle ||
    '剪贴板图文内容';

  const author =
    doc.querySelector('#js_name')?.textContent?.trim() ||
    doc.querySelector('.author-name')?.textContent?.trim() ||
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('.profile_nickname')?.textContent?.trim() ||
    '';

  const contentEl = (
    doc.querySelector('#js_content') ||
    doc.querySelector('.docx-page') ||
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.body
  ).cloneNode(true) as HTMLElement;

  // Remove noise
  const noise = [
    '#js_toobar',
    '.qr_code_pc',
    '.reward_area',
    '.profile_container',
    '.rich_media_tool',
    '#js_pc_qr_code',
    '.original_area_primary',
    '#js_tags',
    'script',
    'style',
  ];
  noise.forEach((sel) => {
    contentEl.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Normalize lazy images (e.g. WeChat data-src)
  const images: string[] = [];
  contentEl.querySelectorAll('img').forEach((img) => {
    const src =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original-src') ||
      img.getAttribute('src');

    if (src && !src.startsWith('data:')) {
      img.setAttribute('src', src);
      if (!images.includes(src)) images.push(src);
    }
  });

  const markdown = convertHtmlToMarkdown(contentEl, { baseUrl: options.sourceUrl }).trim();

  const metadata: KnowledgeMetadata = {
    title,
    author: author || undefined,
    sourceUrl: options.sourceUrl || '',
    platform,
    clippedAt: new Date().toISOString(),
  };

  return {
    metadata,
    markdown,
    images,
  };
}

export interface PrepareClippedDocumentOptions extends LocalizeAssetsOptions {
  localizeAssets?: boolean;
  includeFrontmatter?: boolean;
}

export interface PreparedClippedDocument {
  fullMarkdown: string;
  metadata: KnowledgeMetadata;
  suggestedFileName: string;
  localizationResult?: AssetLocalizationResult;
}

/**
 * Complete pipeline: generate Frontmatter, combine Markdown, and localize remote assets
 */
export async function prepareClippedDocument(
  article: ExtractedArticle,
  options: PrepareClippedDocumentOptions = {}
): Promise<PreparedClippedDocument> {
  const { localizeAssets = true, includeFrontmatter = true, ...localizeOptions } = options;

  let bodyMarkdown = article.markdown;
  let localizationResult: AssetLocalizationResult | undefined;

  // Localize remote assets (images)
  if (localizeAssets) {
    localizationResult = await localizeMarkdownAssets(bodyMarkdown, localizeOptions);
    bodyMarkdown = localizationResult.markdown;
  }

  // Build Frontmatter
  let fullMarkdown = bodyMarkdown;
  if (includeFrontmatter) {
    const frontmatter = buildFrontmatter(article.metadata);
    fullMarkdown = `${frontmatter}\n\n${bodyMarkdown}`;
  }

  // Generate safe filename for workspace
  const cleanTitle = (article.metadata.title || '剪藏文档')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  const platformPrefix = getPlatformLabel(article.metadata.platform);
  const suggestedFileName = `[${platformPrefix}] ${cleanTitle}.md`;

  return {
    fullMarkdown,
    metadata: article.metadata,
    suggestedFileName,
    localizationResult,
  };
}
