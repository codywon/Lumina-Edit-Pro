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
  Clipboard,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  detectPlatform,
  extractArticleFromHtml,
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
  const [inputMode, setInputMode] = useState<'url' | 'html'>('url');
  const [url, setUrl] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<KnowledgePlatform>('generic');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [article, setArticle] = useState<ExtractedArticle | null>(null);

  // Options
  const [saveMode, setSaveMode] = useState<'new-file' | 'insert-cursor'>('new-file');
  const [localizeAssets, setLocalizeAssets] = useState(true);
  const [includeFrontmatter, setIncludeFrontmatter] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Processing state
  const [isSaving, setIsSaving] = useState(false);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setUrl('');
      setHtmlContent('');
      setInputMode('url');
      setArticle(null);
      setExtractError(null);
      setIsExtracting(false);
      setIsSaving(false);
      setProgressText('');
    } else {
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
    const trimmed = value.trim();
    if (trimmed.startsWith('<') || (trimmed.includes('<html') || trimmed.includes('<div') || trimmed.includes('<p>'))) {
      setInputMode('html');
      setHtmlContent(value);
      setExtractError(null);
      return;
    }

    setUrl(value);
    setExtractError(null);
    if (trimmed) {
      setDetectedPlatform(detectPlatform(trimmed));
    } else {
      setDetectedPlatform('generic');
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const trimmed = text.trim();
          if (trimmed.startsWith('<') || (trimmed.includes('<html') || trimmed.includes('<div') || trimmed.includes('<p>'))) {
            setInputMode('html');
            setHtmlContent(text);
            showToast('已从剪贴板读取网页内容', 'info');
          } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            setInputMode('url');
            handleUrlChange(trimmed);
            showToast('已从剪贴板读取链接', 'info');
          } else {
            handleUrlChange(trimmed);
          }
        }
      }
    } catch {
      showToast('无法访问剪贴板，请手动粘贴', 'warning');
    }
  };

  const handleExtract = async () => {
    if (inputMode === 'html') {
      const cleanHtml = htmlContent.trim();
      if (!cleanHtml) {
        setExtractError('请输入或粘贴网页内容');
        return;
      }

      try {
        setIsExtracting(true);
        setExtractError(null);
        setArticle(null);

        const extracted = extractArticleFromHtml(cleanHtml, {
          sourceUrl: url.trim() || undefined,
          platform: url.trim() ? detectPlatform(url.trim()) : 'generic',
        });
        setArticle(extracted);
        setEditedTitle(extracted.metadata.title);
        showToast(`已成功解析: ${extracted.metadata.title}`, 'info');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setExtractError(`解析失败: ${msg}`);
        showToast('解析网页内容失败', 'error');
      } finally {
        setIsExtracting(false);
      }
      return;
    }

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
      if (msg.includes('环境异常') || msg.includes('风控')) {
        setExtractError('触发微信验证拦截。建议在浏览器打开文章后复制，切换至上方【粘贴内容】直接导入。');
      } else {
        setExtractError(`解析失败: ${msg}`);
      }
      showToast('解析网页内容失败', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveAndImport = async () => {
    if (!article) return;

    try {
      setIsSaving(true);
      setProgressText('正在准备文章内容...');

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
          setProgressText(`正在本地化下载图片 (${current}/${total})...`);
        },
      });

      if (saveMode === 'new-file' && onCreateWorkspaceDocument) {
        setProgressText('正在写入新文档...');
        const success = await onCreateWorkspaceDocument(prepared.suggestedFileName, prepared.fullMarkdown);
        if (success) {
          const assetMsg = prepared.localizationResult?.localizedCount
            ? `，已本地化 ${prepared.localizationResult.localizedCount} 张图片`
            : '';
          showToast(`已保存到工作区${assetMsg}`, 'info');
          onClose();
        }
      } else {
        onInsertAtCursor(prepared.fullMarkdown);
        const assetMsg = prepared.localizationResult?.localizedCount
          ? `（已本地化 ${prepared.localizationResult.localizedCount} 张图片）`
          : '';
        showToast(`已插入到当前文档${assetMsg}`, 'info');
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
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-xl bg-white dark:bg-[#18181B] rounded-2xl shadow-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Minimal Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                知识来源与网页剪藏
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={isExtracting || isSaving}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {/* Clean Tab Switcher */}
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/80 pb-2">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('url');
                    setExtractError(null);
                  }}
                  className={cn(
                    'text-xs font-medium pb-1.5 transition-colors relative',
                    inputMode === 'url'
                      ? 'text-orange-600 dark:text-orange-400 font-semibold'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  )}
                >
                  链接解析
                  {inputMode === 'url' && (
                    <motion.div
                      layoutId="activeTabUnderline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('html');
                    setExtractError(null);
                  }}
                  className={cn(
                    'text-xs font-medium pb-1.5 transition-colors relative',
                    inputMode === 'html'
                      ? 'text-orange-600 dark:text-orange-400 font-semibold'
                      : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                  )}
                >
                  粘贴内容
                  {inputMode === 'html' && (
                    <motion.div
                      layoutId="activeTabUnderline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full"
                    />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 flex items-center gap-1 font-medium"
              >
                <Clipboard className="w-3.5 h-3.5" />
                从剪贴板粘贴
              </button>
            </div>

            {/* Input Form */}
            {inputMode === 'url' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                      placeholder="https://mp.weixin.qq.com/... 或 小红书 / 飞书链接..."
                      className="w-full pl-3.5 pr-16 py-2 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 rounded-lg text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    {url.trim() && (
                      <span
                        className={cn(
                          'absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border font-medium',
                          platformBadgeStyles[detectedPlatform]
                        )}
                      >
                        {getPlatformLabel(detectedPlatform)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={isExtracting || !url.trim()}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>解析中</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>解析链接</span>
                      </>
                    )}
                  </button>
                </div>

                {extractError && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2 rounded-lg border border-rose-200/80 dark:border-rose-900/50">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{extractError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={htmlContent}
                  onChange={(e) => {
                    setHtmlContent(e.target.value);
                    setExtractError(null);
                  }}
                  rows={3}
                  placeholder="在此直接粘贴浏览器或网页复制的正文内容..."
                  className="w-full px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700/80 rounded-lg text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:border-orange-500 font-mono transition-colors"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={isExtracting || !htmlContent.trim()}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>解析中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>解析内容</span>
                      </>
                    )}
                  </button>
                </div>
                {extractError && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2 rounded-lg border border-rose-200/80 dark:border-rose-900/50">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{extractError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Extracted Article Result Card */}
            {article && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3.5 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-2.5">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="文章标题"
                  className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-orange-500"
                />

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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
                    <span className="px-2 py-0.5 rounded border bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700">
                      作者: {article.metadata.author}
                    </span>
                  )}
                  {article.images.length > 0 && (
                    <span className="px-2 py-0.5 rounded border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      {article.images.length} 张图片/贴图
                    </span>
                  )}
                </div>

                {/* Minimal Text Preview */}
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 max-h-24 overflow-y-auto px-2.5 py-1.5 bg-white dark:bg-neutral-800/60 rounded-md border border-neutral-200/60 dark:border-neutral-700/40 font-mono whitespace-pre-wrap leading-relaxed">
                  {article.markdown.slice(0, 240)}
                  {article.markdown.length > 240 ? '...' : ''}
                </div>
              </div>
            )}

            {/* Ingestion Destination & Options */}
            {article && (
              <div className="space-y-2.5 pt-1">
                <div className="hidden">
                  <span>保存选项与落盘配置</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors',
                      saveMode === 'new-file'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-orange-900 dark:text-orange-100 font-medium'
                        : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="saveMode"
                      value="new-file"
                      checked={saveMode === 'new-file'}
                      onChange={() => setSaveMode('new-file')}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span>新建工作区文档 (推荐)</span>
                  </label>

                  <label
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors',
                      saveMode === 'insert-cursor'
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-orange-900 dark:text-orange-100 font-medium'
                        : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="saveMode"
                      value="insert-cursor"
                      checked={saveMode === 'insert-cursor'}
                      onChange={() => setSaveMode('insert-cursor')}
                      className="text-orange-500 focus:ring-orange-500"
                    />
                    <span>插入到当前文档</span>
                  </label>
                </div>

                <div className="flex items-center gap-4 text-xs text-neutral-600 dark:text-neutral-300 pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localizeAssets}
                      onChange={(e) => setLocalizeAssets(e.target.checked)}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span>本地离线保存图片</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFrontmatter}
                      onChange={(e) => setIncludeFrontmatter(e.target.checked)}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span>包含 Frontmatter 元数据</span>
                  </label>
                </div>
              </div>
            )}

            {/* In-progress banner */}
            {isSaving && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-xs text-orange-700 dark:text-orange-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{progressText}</span>
              </div>
            )}
          </div>

          {/* Clean Footer */}
          <div className="flex items-center justify-between px-5 py-3 bg-neutral-50/60 dark:bg-neutral-900/60 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-400">
              {article ? `${article.markdown.length} 字符` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveAndImport}
                disabled={!article || isSaving}
                className="px-4 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
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
