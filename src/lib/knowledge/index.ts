import { FeishuAdapter } from './adapters/feishu';
import { GenericWebAdapter } from './adapters/generic';
import { WechatAdapter } from './adapters/wechat';
import { XiaohongshuAdapter } from './adapters/xiaohongshu';
import { localizeMarkdownAssets } from './assetLocalizer';
import { buildFrontmatter } from './frontmatter';
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
