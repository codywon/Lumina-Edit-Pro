import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Globe,
  Loader2,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clipboard,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  detectPlatform,
  extractArticleFromUrl,
  getPlatformLabel,
  prepareClippedDocument,
  type ExtractedArticle,
  type KnowledgePlatform,
} from '../lib/knowledge';

interface KnowledgeSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, level?: 'info' | 'warning' | 'error') => void;
  onInsertAtCursor: (markdown: string) => void;
  onCreateWorkspaceDocument?: (fileName: string, content: string) => Promise<boolean>;
  workspaceId?: string;
  documentFilePath?: string;
  hasActiveWorkspace?: boolean;
}

export default function KnowledgeSourceModal({
  isOpen,
  onClose,
  showToast,
  onInsertAtCursor,
  onCreateWorkspaceDocument,
  workspaceId,
  documentFilePath,
  hasActiveWorkspace = false,
}: KnowledgeSourceModalProps) {
  const [url, setUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<KnowledgePlatform>('generic');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [article, setArticle] = useState<ExtractedArticle | null>(null);

  // Options
  const [saveMode, setSaveMode] = useState<'new-file' | 'insert-cursor'>('new-file');
  const [localizeAssets, setLocalizeAssets] = useState(true);
  const [includeFrontmatter, setIncludeFrontmatter] = useState(true);
  const [editedTitle, setEditedTitle] = useState('');

  // Processing state
  const [isSaving, setIsSaving] = useState(false);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setUrl('');
      setArticle(null);
      setExtractError(null);
      setIsExtracting(false);
      setIsSaving(false);
      setProgressText('');
    } else {
      // Auto-set default save mode based on workspace availability
      setSaveMode(hasActiveWorkspace ? 'new-file' : 'insert-cursor');
    }
  }, [isOpen, hasActiveWorkspace]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExtracting && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExtracting, isSaving, onClose]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setExtractError(null);
    if (value.trim()) {
      setDetectedPlatform(detectPlatform(value.trim()));
    } else {
      setDetectedPlatform('generic');
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          handleUrlChange(text.trim());
          showToast('已从剪贴板读取链接', 'info');
        } else if (text) {
          handleUrlChange(text.trim());
        }
      }
    } catch {
      showToast('无法访问系统剪贴板，请手动粘贴', 'warning');
    }
  };

  const handleExtract = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setExtractError('请输入有效的网页或文章链接');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setExtractError('链接必须以 http:// 或 https:// 开头');
      return;
    }

    try {
      setIsExtracting(true);
      setExtractError(null);
      setArticle(null);

      const extracted = await extractArticleFromUrl(cleanUrl);
      setArticle(extracted);
      setEditedTitle(extracted.metadata.title);
      showToast(`已成功抓取: ${extracted.metadata.title}`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExtractError(`解析失败: ${msg}`);
      showToast('解析网页内容失败，请检查链接或网络', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveAndImport = async () => {
    if (!article) return;

    try {
      setIsSaving(true);
      setProgressText('正在准备文章内容与元数据...');

      // Update title if edited by user
      const finalArticle: ExtractedArticle = {
        ...article,
        metadata: {
          ...article.metadata,
          title: editedTitle.trim() || article.metadata.title,
        },
      };

      const prepared = await prepareClippedDocument(finalArticle, {
        localizeAssets,
        includeFrontmatter,
        workspaceId,
        documentFilePath,
        onProgress: (current, total) => {
          setProgressText(`正在本地化下载图片与贴图 (${current}/${total})...`);
        },
      });

      if (saveMode === 'new-file' && onCreateWorkspaceDocument) {
        setProgressText('正在写入工作区新文件...');
        const success = await onCreateWorkspaceDocument(prepared.suggestedFileName, prepared.fullMarkdown);
        if (success) {
          const assetMsg = prepared.localizationResult?.localizedCount
            ? `，并离线保存了 ${prepared.localizationResult.localizedCount} 张图片`
            : '';
          showToast(`已成功保存为工作区新文档${assetMsg}`, 'info');
          onClose();
        }
      } else {
        // Insert into current document
        onInsertAtCursor(prepared.fullMarkdown);
        const assetMsg = prepared.localizationResult?.localizedCount
          ? `（已本地化 ${prepared.localizationResult.localizedCount} 张图片）`
          : '';
        showToast(`已成功插入到当前文档${assetMsg}`, 'info');
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`保存失败: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
      setProgressText('');
    }
  };

  if (!isOpen) return null;

  const platformBadgeStyles: Record<KnowledgePlatform, string> = {
    wechat: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    xiaohongshu: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    feishu: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    generic: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20',
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isExtracting && !isSaving && onClose()}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl bg-white dark:bg-[#1a1b26] rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  知识来源与网页剪藏
                  <span className="text-xs px-2 py-0.5 rounded-full font-normal border bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800">
                    离线高保真
                  </span>
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  支持微信公众号图文、小红书笔记（含贴图）、飞书云文档及通用网页
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isExtracting || isSaving}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* URL Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <span>目标网页链接</span>
                  {url.trim() && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded border uppercase font-medium',
                        platformBadgeStyles[detectedPlatform]
                      )}
                    >
                      {getPlatformLabel(detectedPlatform)}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  从剪贴板粘贴
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                  placeholder="https://mp.weixin.qq.com/... 或 小红书 / 飞书链接..."
                  className="flex-1 px-3.5 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700/80 rounded-lg text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isExtracting || !url.trim()}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-orange-500/10 flex items-center gap-1.5 transition-all"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>解析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>解析链接</span>
                    </>
                  )}
                </button>
              </div>

              {extractError && (
                <div className="flex items-center gap-1.5 text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/50">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{extractError}</span>
                </div>
              )}
            </div>

            {/* Extracted Article Preview */}
            {article && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">文章标题</label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full text-sm font-medium px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Metadata badges */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded border font-medium flex items-center gap-1',
                      platformBadgeStyles[article.metadata.platform]
                    )}
                  >
                    <Layers className="w-3 h-3" />
                    {getPlatformLabel(article.metadata.platform)}
                  </span>
                  {article.metadata.author && (
                    <span className="px-2 py-0.5 rounded border bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700">
                      作者: {article.metadata.author}
                    </span>
                  )}
                  {article.metadata.publishDate && (
                    <span className="px-2 py-0.5 rounded border bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700">
                      发布: {article.metadata.publishDate}
                    </span>
                  )}
                  {article.images.length > 0 && (
                    <span className="px-2 py-0.5 rounded border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      {article.images.length} 张图片/贴图
                    </span>
                  )}
                </div>

                {/* Snippet Preview */}
                <div className="text-xs text-neutral-600 dark:text-neutral-400 max-h-32 overflow-y-auto p-2.5 bg-white dark:bg-neutral-800/60 rounded border border-neutral-200 dark:border-neutral-700/50 font-mono whitespace-pre-wrap">
                  {article.markdown.slice(0, 360)}
                  {article.markdown.length > 360 ? '...' : ''}
                </div>
              </div>
            )}

            {/* Ingestion Options */}
            {article && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  保存选项与落盘配置
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={cn(
                      'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all',
                      saveMode === 'new-file'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-orange-950 dark:text-orange-100'
                        : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="saveMode"
                      value="new-file"
                      checked={saveMode === 'new-file'}
                      onChange={() => {
                        setSaveMode('new-file');
                        setIncludeFrontmatter(true);
                      }}
                      className="mt-0.5 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="text-xs">
                      <div className="font-medium">新建工作区文档 (推荐)</div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-[11px] mt-0.5">
                        作为独立知识文件存入当前目录
                      </div>
                    </div>
                  </label>

                  <label
                    className={cn(
                      'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all',
                      saveMode === 'insert-cursor'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-orange-950 dark:text-orange-100'
                        : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="saveMode"
                      value="insert-cursor"
                      checked={saveMode === 'insert-cursor'}
                      onChange={() => {
                        setSaveMode('insert-cursor');
                        setIncludeFrontmatter(false);
                      }}
                      className="mt-0.5 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="text-xs">
                      <div className="font-medium">插入到当前文档</div>
                      <div className="text-neutral-500 dark:text-neutral-400 text-[11px] mt-0.5">
                        在光标处插入剪藏的正文与贴图
                      </div>
                    </div>
                  </label>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localizeAssets}
                      onChange={(e) => setLocalizeAssets(e.target.checked)}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span>
                      离线本地化所有图片至 <code className="text-[11px] text-orange-600 dark:text-orange-400 font-mono">.assets</code> 目录
                      <span className="text-neutral-400 dark:text-neutral-500 ml-1">(彻底解决微信/小红书/飞书防盗链 403 碎图)</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFrontmatter}
                      onChange={(e) => setIncludeFrontmatter(e.target.checked)}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span>
                      注入 YAML Frontmatter
                      <span className="text-neutral-400 dark:text-neutral-500 ml-1">(记录原作者、出处 URL、剪藏时间)</span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Progress Text during Saving */}
            {isSaving && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>{progressText}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 bg-neutral-50/50 dark:bg-neutral-900/50 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-xs text-neutral-400">
              {article ? `已提取 ${article.markdown.length} 字符` : '输入任意网页、公众号、小红书或飞书链接开始剪藏'}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveAndImport}
                disabled={!article || isSaving}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-orange-500/10 flex items-center gap-1.5 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在导入...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{saveMode === 'new-file' ? '新建文档并导入' : '插入到当前文档'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
