export type KnowledgePlatform = 'wechat' | 'xiaohongshu' | 'feishu' | 'generic';

export interface KnowledgeMetadata {
  title: string;
  author?: string;
  publishDate?: string;
  sourceUrl: string;
  platform: KnowledgePlatform;
  tags?: string[];
  coverUrl?: string;
  summary?: string;
  viewCount?: number;
  likeCount?: number;
  clippedAt: string;
}

export interface ExtractedArticle {
  metadata: KnowledgeMetadata;
  markdown: string;
  images: string[];
}

export interface LocalizedAssetInfo {
  remoteUrl: string;
  localPath: string;
  size: number;
}

export interface AssetLocalizationResult {
  markdown: string;
  localizedCount: number;
  failedCount: number;
  assets: LocalizedAssetInfo[];
}

export interface LocalizeAssetsOptions {
  documentFilePath?: string;
  workspaceId?: string;
  workspaceRootPath?: string;
  assetsDirName?: string; // defaults to '.assets'
  referer?: string;
  onProgress?: (current: number, total: number, url: string) => void;
  // Fallback direct storage handler when not in native mode
  customSaveBinary?: (relativePath: string, bytes: Uint8Array) => Promise<string | void>;
}

export interface KnowledgeAdapter {
  platform: KnowledgePlatform;
  canHandle(url: string): boolean;
  extract(url: string, rawHtml?: string): Promise<ExtractedArticle>;
}
