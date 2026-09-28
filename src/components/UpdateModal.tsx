import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Download, ArrowUpCircle, Check, AlertCircle, RefreshCw, ExternalLink, Loader2, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReleaseInfo, DownloadProgress } from '../services/updater/types';
import { CURRENT_APP_VERSION, downloadUpdate, cancelUpdate, applyUpdateAndRestart, saveUpdateAs } from '../services/updater/client';
import { isTauriRuntime } from '../services/native';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  release: ReleaseInfo | null;
  showToast?: (message: string, level?: 'info' | 'warning' | 'error') => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '未知大小';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}

export default function UpdateModal({
  isOpen,
  onClose,
  release,
  showToast,
}: UpdateModalProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState<DownloadProgress>({ receivedBytes: 0, totalBytes: 0, percent: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStatus('idle');
      setProgress({ receivedBytes: 0, totalBytes: 0, percent: 0 });
      setErrorMessage(null);
      setIsApplying(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen]);

  const handleStartDownload = async () => {
    if (!release?.assetUrl) {
      showToast?.('未找到下载文件链接', 'error');
      return;
    }

    if (!isTauriRuntime()) {
      window.open(release.htmlUrl || release.assetUrl, '_blank');
      return;
    }

    setStatus('downloading');
    setErrorMessage(null);
    setProgress({ receivedBytes: 0, totalBytes: release.assetSize, percent: 0 });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await downloadUpdate(
        release.assetUrl,
        release.assetSize,
        (p) => {
          setProgress(p);
        },
        controller.signal
      );
      setStatus('ready');
      showToast?.('新版本下载完成，随时可立即重启更新', 'info');
    } catch (err: any) {
      if (err?.message?.includes('取消')) {
        setStatus('idle');
        showToast?.('下载已取消', 'info');
      } else {
        setStatus('error');
        setErrorMessage(err?.message || '下载新版本失败，请检查网络后重试');
        showToast?.('下载失败，请检查网络或在网页端下载', 'error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    await cancelUpdate();
    setStatus('idle');
  };

  const handleApplyAndRestart = async () => {
    setIsApplying(true);
    try {
      await applyUpdateAndRestart();
    } catch (err: any) {
      setIsApplying(false);
      showToast?.(err?.message || '替换更新失败', 'error');
    }
  };

  const handleOpenBrowser = () => {
    const url = release?.htmlUrl || 'https://github.com/codywon/Lumina-Edit-Pro/releases';
    window.open(url, '_blank');
  };

  if (!isOpen || !release) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={status === 'downloading' ? undefined : onClose}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-[#18181B] shadow-2xl border border-slate-200 dark:border-[#27272A] flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Banner */}
          <div className="p-6 bg-gradient-to-r from-accent/15 via-accent/5 to-transparent border-b border-slate-200/80 dark:border-white/10 relative">
            <button
              onClick={onClose}
              disabled={status === 'downloading' || isApplying}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
              title="关闭"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-accent text-white flex items-center justify-center shadow-md shadow-accent/20 shrink-0">
                <ArrowUpCircle size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">发现新版本发布</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent text-white shadow-2xs">
                    {release.tagName || `v${release.version}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>当前版本: v{CURRENT_APP_VERSION}</span>
                  {release.publishedAt && <span>· 发布于 {formatDate(release.publishedAt)}</span>}
                  {release.assetSize > 0 && <span>· 大小约 {formatBytes(release.assetSize)}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Release Notes Body */}
          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">更新内容与新特性 (Release Notes)</div>
            <div className="prose-custom max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50/80 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/5 overflow-x-auto">
              {release.body ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {release.body}
                </ReactMarkdown>
              ) : (
                <p className="italic text-slate-400">本次发布包含多项功能升级与稳定性优化。</p>
              )}
            </div>

            {/* Error Message display */}
            {status === 'error' && errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">更新下载遇到问题</p>
                  <p className="mt-0.5 text-[11px] opacity-90">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Downloading Progress Bar */}
            {status === 'downloading' && (
              <div className="p-4 rounded-xl bg-accent-soft/40 border border-accent/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-accent" />
                    正在下载新版本 ({formatBytes(progress.receivedBytes)} / {formatBytes(progress.totalBytes)})
                  </span>
                  <span className="font-bold text-accent font-mono">{progress.percent}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-150 rounded-full"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Ready for restart message */}
            {status === 'ready' && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-xs text-emerald-700 dark:text-emerald-300">
                <div className="size-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Check size={18} />
                </div>
                <div>
                  <p className="font-bold">新版本已完全就绪！</p>
                  <p className="text-[11px] opacity-90 mt-0.5">点击下方【立即重启升级】，应用将毫秒级原地置换并自动拉起全新版本。</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 px-6 bg-slate-50 dark:bg-[#121214] border-t border-slate-200 dark:border-[#27272A] flex items-center justify-between">
            <button
              type="button"
              onClick={handleOpenBrowser}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ExternalLink size={13} />
              <span>在 GitHub 中打开</span>
            </button>

            <div className="flex items-center gap-2">
              {status === 'downloading' ? (
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg transition-colors font-medium"
                >
                  取消下载
                </button>
              ) : status === 'ready' ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                  >
                    稍后重启
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAndRestart}
                    disabled={isApplying}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isApplying ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>正在重启...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} />
                        <span>🚀 立即重启升级</span>
                      </>
                    )}
                  </button>
                </>
              ) : status === 'error' ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                  >
                    <RefreshCw size={13} />
                    <span>重试下载</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                  >
                    稍后提醒
                  </button>
                  <button
                    type="button"
                    onClick={handleStartDownload}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-lg shadow-md shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Download size={14} />
                    <span>一键下载并更新</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
