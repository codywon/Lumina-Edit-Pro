import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Send, Sparkles, StopCircle, Trash2, X } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAI } from '../contexts/AIContext';
import { buildPromptMessages } from '../lib/ai/promptBuilder';
import { summarizeContextWithModel } from '../lib/ai/contextCompression';
import { createChatCompletion, createImageGeneration, normalizeError } from '../lib/ai/openaiClient';
import { isValidApiKey, isValidBaseUrl } from '../lib/ai/validation';
import type { AITemplate, AIMessage } from '../lib/ai/types';
import { cn } from '../lib/utils';

interface SidebarRightProps {
  content: string;
  setContent: (content: string) => void;
  onInsertAtEnd?: (
    content: string,
    options?: { onProgress?: (message: string) => void }
  ) => void | Promise<void>;
  onClose?: () => void;
  showToast?: (msg: string, level?: 'info' | 'warning' | 'error') => void;
  selectedText?: string;
  documentId: string;
  onOpenAICenter?: () => void;
  onRetrieveWorkspaceContext?: (query: string) => Promise<string>;
  onPersistGeneratedAssets?: (content: string) => Promise<string>;
}

interface ChatMessage extends AIMessage {
  status?: 'streaming' | 'error' | 'cancelled';
  errorDetail?: string;
}

function CodeBlockWithCopy({ language, code, children }: { language: string; code: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="not-prose my-2.5 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 bg-[#21252b] text-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1b1d23] border-b border-white/5 text-[11px] text-slate-400 select-none">
        <span className="font-mono uppercase font-semibold tracking-wider text-[10px] text-slate-400">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">已复制</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span className="text-[10px]">复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 m-0 overflow-x-auto text-[12px] font-mono leading-relaxed custom-scrollbar bg-transparent text-[#abb2bf]">
        {children}
      </pre>
    </div>
  );
}

const EMPTY_RESPONSE_TEXT = '未返回内容';
const SAFE_DATA_IMAGE_URL = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const IMAGE_GENERATION_INTENT_PATTERN = /(生成|画|绘制|做|制作|创建).{0,12}(图|图片|插图|配图|海报|封面|总结图|示意图)|总结图|配图|插画|海报/i;

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

function markdownUrlTransform(url: string) {
  if (SAFE_DATA_IMAGE_URL.test(url)) {
    return url;
  }

  return defaultUrlTransform(url);
}

function isImageGenerationRequest(input: string) {
  return IMAGE_GENERATION_INTENT_PATTERN.test(input);
}

function extractInsertableMessageContent(content: string) {
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  const images = Array.from(content.matchAll(MARKDOWN_IMAGE_PATTERN)).map((match) => match[0]);
  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;

  if (images.length > 0) {
    return images.join('\n\n');
  }

  return content;
}

function buildImageGenerationPrompt(input: string, documentText: string, selectedText: string) {
  const context = (selectedText.trim() || documentText.trim()).slice(0, 8000);
  const contextLabel = selectedText.trim() ? '选中文本' : '当前 Markdown 文档';

  return [
    input,
    '',
    '请生成一张适合插入 Markdown 文档的图片。若用户要求总结图，请把内容转化为清晰的视觉总结/信息图，而不是输出文字说明。',
    context ? `\n${contextLabel}：\n${context}` : '',
  ].join('\n');
}

function SidebarRightComponent({
  content,
  setContent,
  onInsertAtEnd,
  onClose,
  showToast,
  selectedText = '',
  documentId,
  onOpenAICenter,
  onRetrieveWorkspaceContext,
  onPersistGeneratedAssets,
}: SidebarRightProps) {
  const {
    provider,
    chatPreferences,
    templates,
    memory,
    chatHistory,
    setChatHistoryForDoc,
    updateChatPreferences,
    updateMemory,
    markTemplateUsed,
    clearChatHistory,
  } = useAI();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contextTruncated, setContextTruncated] = useState(false);
  const [contextCompressed, setContextCompressed] = useState(false);
  const [historyUsed, setHistoryUsed] = useState(false);
  const [docSearchUsed, setDocSearchUsed] = useState(false);
  const [streamFallback, setStreamFallback] = useState(false);
  const [insertingMessageId, setInsertingMessageId] = useState<string | null>(null);
  const [insertionProgressText, setInsertionProgressText] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const insertTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (insertTimerRef.current !== null) clearTimeout(insertTimerRef.current);
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const [aiFontSize, setAiFontSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('lumina-ai-font-size');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 12 && parsed <= 18) return parsed;
      }
    } catch {}
    return 14;
  });

  useEffect(() => {
    try {
      localStorage.setItem('lumina-ai-font-size', String(aiFontSize));
    } catch {}
  }, [aiFontSize]);
  const [failedRequest, setFailedRequest] = useState<{
    userInput: string;
    templateId: string | null;
    scope: typeof chatPreferences.contextScope;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);
  const configReady =
    isValidBaseUrl(provider.baseUrl) && isValidApiKey(provider.apiKey) && provider.defaultModel.trim().length > 0;
  const sessionScope = chatPreferences.sessionScope ?? 'document';
  const historyKey = sessionScope === 'global' ? 'global' : `doc:${documentId}`;
  const formatHistoryLabel = (key: string) => {
    if (key === 'global') return '全局';
    if (key.startsWith('doc:')) return key.slice(4) || '未命名';
    return key;
  };
  const defaultTemplate =
    templates.templates.find((item) => item.id === templates.defaultTemplateId) ?? null;
  const hasMessages = messages.length > 0;
  const contextScopeOptions = [
    {
      value: 'document',
      label: '当前全文',
      title: '本次提问会把当前 Markdown 正文作为参考资料发给 AI',
    },
    {
      value: 'selection',
      label: '选中文字',
      title: '本次提问只把当前选中的文字作为参考资料发给 AI；未选中文字时会自动改用全文',
    },
    {
      value: 'none',
      label: '仅问题',
      title: '本次提问只发送输入框里的问题，不附带正文或选区内容',
    },
  ] as const;

  useEffect(() => {
    abortRef.current?.abort();
    requestInFlightRef.current = false;
    setIsLoading(false);
    setFailedRequest(null);
    const history = chatHistory[historyKey] ?? [];
    setMessages(history as ChatMessage[]);
  }, [historyKey]);

  useEffect(() => {
    if (requestInFlightRef.current) {
      return;
    }

    const history = chatHistory[historyKey] ?? [];
    setMessages(history as ChatMessage[]);
  }, [chatHistory, historyKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!imagePreview) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreview(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  const persistMessages = (next: ChatMessage[]) => {
    const compact = next.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
    }));
    setChatHistoryForDoc(historyKey, compact);
  };

  const appendMessage = (message: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, message];
      persistMessages(next);
      return next;
    });
  };

  const updateMessage = (id: string, patch: Partial<ChatMessage>, shouldPersist = false) => {
    setMessages((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
      if (shouldPersist) {
        persistMessages(next);
      }
      return next;
    });
  };

  const buildRequest = async (userInput: string, template: AITemplate | null, signal?: AbortSignal) => {
    let scope = template?.scope ?? chatPreferences.contextScope;
    const hasSelection = Boolean(selectedText.trim());
    if (scope !== 'none' && scope !== 'selection' && hasSelection) {
      scope = 'selection';
      showToast?.('检测到选中文本，已优先使用选区', 'info');
    }
    if (scope === 'selection' && !hasSelection) {
      scope = 'document';
      showToast?.('未检测到选中文本，已使用全文上下文', 'warning');
    }
    const memoryInput = chatPreferences.useMemory ? memory : { ...memory, enabled: false };
    const historyPool = chatPreferences.historySearchEnabled
      ? chatPreferences.historySearchScope === 'all'
        ? Object.entries(chatHistory).flatMap(([key, messages]) =>
            messages.map((item) => ({ ...item, docId: formatHistoryLabel(key) }))
          )
        : (chatHistory[historyKey] ?? []).map((item) => ({ ...item, docId: formatHistoryLabel(historyKey) }))
      : [];
    const modelContextWindow =
      provider.modelContextWindows?.[provider.defaultModel] ?? chatPreferences.contextWindowTokens;
    const docSearchContext =
      chatPreferences.docSearchEnabled && onRetrieveWorkspaceContext
        ? await onRetrieveWorkspaceContext(userInput)
        : '';
    const {
      messages: requestMessages,
      truncated,
      compressed,
      historyUsed: usedHistory,
      docSearchUsed: usedDocSearch,
      summaryUpdate,
    } = await buildPromptMessages({
      memory: memoryInput,
      template,
      contextScope: scope,
      documentText: content,
      selectionText: selectedText,
      userInput,
      history: historyPool,
      historySearchEnabled: chatPreferences.historySearchEnabled,
      historySearchQuery: userInput,
      historySearchOptions: { maxHits: 6, maxChars: 140 },
      documentSearchContext: docSearchContext,
      contextBudget: {
        autoSummarize: chatPreferences.autoSummarize,
        maxTokens: modelContextWindow,
        warnRatio: chatPreferences.contextWarnRatio,
        summarizeDocument: true,
      },
      summarize: (text) =>
        summarizeContextWithModel({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.defaultModel,
          text,
          signal,
        }),
    });
    if (summaryUpdate && memoryInput.enabled) {
      updateMemory({ summary: summaryUpdate });
    }
    return { requestMessages, scope, truncated, compressed, historyUsed: usedHistory, docSearchUsed: usedDocSearch };
  };

  const formatErrorMessage = (error: ReturnType<typeof normalizeError>) => {
    switch (error.type) {
      case 'auth':
        return { title: 'API Key 无效或过期', hint: '请更新 API Key', showConfig: true };
      case 'network':
        return { title: '网络连接失败', hint: '请检查网络或 baseUrl', showConfig: true };
      case 'rate_limit':
        return { title: '请求过于频繁', hint: '稍后重试', showConfig: false };
      case 'invalid_request':
        return { title: '请求参数无效', hint: error.message, showConfig: true };
      case 'server':
        return { title: '服务端异常', hint: '稍后重试', showConfig: false };
      case 'stream':
        return { title: '生成已停止', hint: error.message, showConfig: false };
      default:
        return { title: '请求失败', hint: error.message, showConfig: false };
    }
  };

  const handleSend = async (overrideInput?: string, overrideTemplate?: AITemplate | null) => {
    let userInput = (overrideInput ?? input).trim();
    let templateToUse = overrideTemplate ?? defaultTemplate;
    if (userInput.startsWith('/')) {
      const [command, ...rest] = userInput.slice(1).split(/\s+/);
      const match = templates.templates.find(
        (item) => item.slashCommand.toLowerCase() === command.toLowerCase()
      );
      if (match) {
        templateToUse = match;
        userInput = rest.join(' ').trim();
      }
    }
    if ((!userInput && !templateToUse) || isLoading) return;
    if (!configReady) {
      showToast?.('请先完成 AI 配置', 'warning');
      return;
    }

    const userDisplay = userInput || (templateToUse ? `/${templateToUse.slashCommand}` : '');
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userDisplay,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantId = `assistant-${Date.now() + 1}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'streaming',
    };

    setInput('');
    requestInFlightRef.current = true;
    setIsLoading(true);
    setContextTruncated(false);
    setContextCompressed(false);
    setHistoryUsed(false);
    setDocSearchUsed(false);
    setStreamFallback(false);
    appendMessage(userMessage);
    setMessages((prev) => [...prev, assistantMessage]);

    if (templateToUse) {
      markTemplateUsed(templateToUse.id);
    }

    let scopeForRequest = templateToUse?.scope ?? chatPreferences.contextScope;
    let streamedContent = '';

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (isImageGenerationRequest(userInput)) {
        const result = await createImageGeneration({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.imageModel || 'gpt-image-2',
          prompt: buildImageGenerationPrompt(userInput, content, selectedText),
          size: provider.imageSize || 'auto',
          quality: provider.imageQuality || 'auto',
          signal: controller.signal,
        });

        let assistantContent = result.imageMarkdown;
        if (onPersistGeneratedAssets) {
          try {
            assistantContent = await onPersistGeneratedAssets(result.imageMarkdown);
          } catch (error) {
            console.error('Error persisting generated AI image:', error);
            showToast?.(
              (error as Error | undefined)?.message || 'AI 图片保存到本地资产失败，历史记录可能无法长期恢复图片',
              'warning'
            );
          }
        }

        updateMessage(
          assistantId,
          {
            content: assistantContent,
            status: undefined,
          },
          true
        );
        setFailedRequest(null);
        return;
      }

      const {
        requestMessages,
        truncated,
        scope,
        compressed,
        historyUsed: usedHistory,
        docSearchUsed: usedDocSearch,
      } = await buildRequest(
        userInput,
        templateToUse,
        controller.signal
      );
      scopeForRequest = scope;
      setContextTruncated(truncated);
      setContextCompressed(compressed);
      setHistoryUsed(usedHistory);
      setDocSearchUsed(usedDocSearch);

      const result = await createChatCompletion(
        {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.defaultModel,
          messages: requestMessages,
          stream: chatPreferences.stream,
          signal: controller.signal,
        },
        {
          onDelta: (delta) => {
            streamedContent += delta;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantId ? { ...item, content: `${item.content}${delta}` } : item
              )
            );
          },
          onFallback: () => setStreamFallback(true),
        }
      );

      const rawAssistantContent = result.content || streamedContent || EMPTY_RESPONSE_TEXT;
      let assistantContent = rawAssistantContent;
      if (rawAssistantContent !== EMPTY_RESPONSE_TEXT && onPersistGeneratedAssets) {
        try {
          assistantContent = await onPersistGeneratedAssets(rawAssistantContent);
        } catch (error) {
          console.error('Error persisting generated AI assets:', error);
          showToast?.(
            (error as Error | undefined)?.message || 'AI 图片保存到本地资产失败，历史记录可能无法长期恢复图片',
            'warning'
          );
        }
      }

      updateMessage(
        assistantId,
        {
          content: assistantContent,
          status: undefined,
        },
        true
      );
      setFailedRequest(null);
    } catch (err) {
      const normalized = normalizeError(err);
      const { title, hint, showConfig } = formatErrorMessage(normalized);
      updateMessage(
        assistantId,
        {
          content: `${title}\n${hint}`,
          status: normalized.type === 'stream' ? 'cancelled' : 'error',
          errorDetail: normalized.detail || normalized.message,
        },
        true
      );
      setFailedRequest({ userInput, templateId: templateToUse?.id ?? null, scope: scopeForRequest });
      if (showConfig && onOpenAICenter) {
        // optional: highlight configuration entry
      }
    } finally {
      requestInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (!failedRequest) return;
    const template = templates.templates.find((item) => item.id === failedRequest.templateId) ?? null;
    handleSend(failedRequest.userInput, template);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    requestInFlightRef.current = false;
    setIsLoading(false);
  };

  const handleInsert = async (message: ChatMessage) => {
    if (insertingMessageId) {
      return;
    }

    flushSync(() => {
      setInsertingMessageId(message.id);
      setInsertionProgressText('准备插入到正文末尾...');
    });
    showToast?.('正在插入到文档末尾...', 'info');
    await waitForNextPaint();

    try {
      if (onInsertAtEnd) {
        await onInsertAtEnd(extractInsertableMessageContent(message.content), {
          onProgress: (progressMessage) => {
            flushSync(() => {
              setInsertionProgressText(progressMessage);
            });
          },
        });
      } else {
        setInsertionProgressText('正在写入正文末尾...');
        await waitForNextPaint();
        setContent(`${content}\n\n${extractInsertableMessageContent(message.content)}`);
      }
      setInsertionProgressText('已插入到文档末尾');
      showToast?.('已插入到文档末尾', 'info');
    } catch (error) {
      console.error('Error inserting AI content:', error);
      const friendlyMessage =
        error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
          ? error.message
          : '插入失败，请稍后重试';
      showToast?.(friendlyMessage, 'error');
    } finally {
      setInsertingMessageId(null);
      if (insertTimerRef.current !== null) clearTimeout(insertTimerRef.current);
      if (typeof window !== 'undefined') {
        insertTimerRef.current = window.setTimeout(() => setInsertionProgressText(null), 800);
      }
    }
  };

  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard?.writeText(msg.content).then(() => {
      setCopiedMessageId(msg.id);
      showToast?.('已复制回复内容到剪贴板', 'info');
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      if (typeof window !== 'undefined') {
        copyTimerRef.current = window.setTimeout(() => setCopiedMessageId(null), 2000);
      }
    });
  };

  const QUICK_PROMPTS = [
    { label: '✨ 润色', prompt: '请对以下内容进行润色，提升文采和流畅度：\n' },
    { label: '📝 总结', prompt: '请提炼要点，列出核心要旨和结论：\n' },
    { label: '📋 大纲', prompt: '请根据内容梳理出层次分明的 Markdown 结构大纲：\n' },
    { label: '🔍 纠错', prompt: '请检查并修正可能存在的错别字与语法问题：\n' },
    { label: '🌐 翻译', prompt: '请将以下内容翻译为纯正地道的英文 Markdown：\n' },
  ];

  const canInsertMessageContent = (message: ChatMessage) =>
    message.role === 'assistant' &&
    !message.status &&
    message.content.trim().length > 0 &&
    message.content.trim() !== EMPTY_RESPONSE_TEXT;

  const markdownComponents = useMemo(
    () => ({
      img: ({ src, alt, title }: any) => {
        const imageSrc = typeof src === 'string' ? src : '';
        const imageAlt = typeof alt === 'string' ? alt : 'AI 生成图片';

        return (
          <img
            src={imageSrc}
            alt={imageAlt}
            title={title || '双击预览大图'}
            className="max-h-72 cursor-zoom-in rounded-xl border border-slate-200 bg-white object-contain shadow-sm transition hover:shadow-md dark:border-[#27272A] dark:bg-[#0E0E11]"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (imageSrc) {
                setImagePreview({ src: imageSrc, alt: imageAlt });
              }
            }}
          />
        );
      },
      pre: ({ children }: any) => {
        return <div className="not-prose my-1.5">{children}</div>;
      },
      code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const codeString = String(children).replace(/\n$/, '');
        if (!inline && (match || codeString.includes('\n'))) {
          return (
            <CodeBlockWithCopy language={match ? match[1] : 'code'} code={codeString}>
              <code className={className} {...props}>
                {children}
              </code>
            </CodeBlockWithCopy>
          );
        }
        return (
          <code className="bg-slate-200/60 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>
            {children}
          </code>
        );
      },
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-2 rounded-lg border border-slate-200 dark:border-white/10 custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }: any) => (
        <th className="bg-slate-100 dark:bg-[#18181B] font-semibold px-2.5 py-1.5 border-b border-slate-200 dark:border-[#27272A]">{children}</th>
      ),
      td: ({ children }: any) => (
        <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-[#202024]">{children}</td>
      ),
    }),
    []
  );

  const handleClearCurrentSession = () => {
    if (!hasMessages) {
      showToast?.('当前会话已经为空', 'info');
      return;
    }

    const sessionLabel = sessionScope === 'global' ? '全局会话' : '当前文档会话';
    const confirmed = window.confirm(`确定清除${sessionLabel}的 AI 聊天记录吗？`);
    if (!confirmed) {
      return;
    }

    abortRef.current?.abort();
    requestInFlightRef.current = false;
    setIsLoading(false);
    setMessages([]);
    setFailedRequest(null);
    setContextTruncated(false);
    setContextCompressed(false);
    setHistoryUsed(false);
    setDocSearchUsed(false);
    setStreamFallback(false);
    clearChatHistory(historyKey);
    showToast?.(`已清除${sessionLabel}`, 'info');
  };

  return (
    <aside
      className="w-full h-full shrink-0 flex flex-col border-l border-slate-200 dark:border-[#27272A] bg-slate-50/60 dark:bg-[#0E0E11] z-10"
      style={{ '--ai-font-size': `${aiFontSize}px` } as React.CSSProperties}
    >
      {/* Tier 1: Main Header Bar */}
      <div className="p-3 border-b border-slate-200 dark:border-[#27272A] flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="p-1.5 bg-accent-soft rounded-md text-accent shrink-0">
            <Sparkles size={16} className="fill-current" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap block">AI 助手</span>
            <button
              type="button"
              onClick={onOpenAICenter}
              title={`当前模型: ${provider.defaultModel || '未配置'} (点击打开配置)`}
              className="text-[11px] text-slate-400 hover:text-accent truncate block text-left transition-colors max-w-[200px]"
            >
              模型：{provider.defaultModel || '未配置'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleClearCurrentSession}
            disabled={!hasMessages}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              hasMessages
                ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
            )}
            title={sessionScope === 'global' ? '清除全局 AI 会话' : '清除当前文档 AI 会话'}
            aria-label={sessionScope === 'global' ? '清除全局 AI 会话' : '清除当前文档 AI 会话'}
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#27272A] transition-colors"
            title="关闭 AI 侧边栏"
            aria-label="关闭 AI 侧边栏"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tier 2: Dedicated Session Scope & Typography Toolbar */}
      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-[#1e1e24] bg-slate-50/70 dark:bg-[#121215] flex items-center justify-between gap-2">
        <div
          className="flex items-center rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-0.5 shrink-0"
          title="字号缩放：独立调节 AI 回复文本大小，与主编辑器字号解耦"
        >
          <button
            type="button"
            disabled={aiFontSize <= 12}
            onClick={() => setAiFontSize((prev) => Math.max(12, prev - 1))}
            className="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
            title={`缩小字号 (当前: ${aiFontSize}px)`}
            aria-label="缩小字号"
          >
            A-
          </button>
          <span className="text-[10px] text-slate-400 font-mono px-1 select-none font-medium">{aiFontSize}</span>
          <button
            type="button"
            disabled={aiFontSize >= 18}
            onClick={() => setAiFontSize((prev) => Math.min(18, prev + 1))}
            className="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
            title={`放大字号 (当前: ${aiFontSize}px)`}
            aria-label="放大字号"
          >
            A+
          </button>
        </div>

        <div
          className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] p-0.5 shrink-0"
          title="历史记录保存位置：当前文档=只在这个文档里显示；全局共用=所有文档共用同一份 AI 历史"
        >
          <span className="px-1.5 text-[10px] font-semibold text-slate-400">历史</span>
          {(['document', 'global'] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => updateChatPreferences({ sessionScope: scope })}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-md transition-colors whitespace-nowrap',
                sessionScope === scope
                  ? 'bg-accent-soft text-accent font-medium'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              )}
              title={scope === 'document' ? '历史只保存/显示在当前文档' : '所有文档共用这份历史'}
            >
              {scope === 'document' ? '当前文档' : '全局'}
            </button>
          ))}
        </div>
      </div>

      {!configReady && (
        <div className="mx-3 mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200 text-sm flex items-center justify-between">
          <span>请先完成 AI 配置</span>
          <button
            onClick={onOpenAICenter}
            className="text-sm font-medium text-amber-600 dark:text-amber-300"
          >
            去配置
          </button>
        </div>
      )}

      {contextTruncated && (
        <div className="mx-3 mt-2 text-xs text-amber-500">已截断文档上下文以适配长度限制</div>
      )}
      {contextCompressed && (
        <div className="mx-3 mt-2 text-xs text-emerald-500">上下文已自动摘要</div>
      )}
      {historyUsed && (
        <div className="mx-3 mt-2 text-xs text-slate-500">已检索历史记录</div>
      )}
      {docSearchUsed && (
        <div className="mx-3 mt-2 text-xs text-slate-500">已检索相关文档片段</div>
      )}
      {streamFallback && (
        <div className="mx-3 mt-2 text-xs text-amber-500">流式不可用，已切换为非流式</div>
      )}
      {insertionProgressText && (
        <div className="mx-3 mt-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-medium text-accent flex items-center gap-2">
          {insertingMessageId ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          <span>{insertionProgressText}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={cn(
                'rounded-xl text-sm leading-relaxed transition-colors',
                msg.role === 'user'
                  ? 'p-3 bg-accent text-white rounded-tr-none shadow-sm max-w-[88%]'
                  : 'p-4 bg-white dark:bg-[#141418] border border-slate-200/90 dark:border-white/10 shadow-xs w-full text-slate-800 dark:text-slate-200'
              )}
            >
              {msg.role === 'assistant' && msg.status === 'streaming' && !msg.content && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 size={14} className="animate-spin text-accent" /> AI 正在思考...
                </div>
              )}
              {msg.role === 'assistant' ? (
                <div className="prose-ai w-full max-w-none prose-pre:overflow-x-auto">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={markdownUrlTransform}
                    components={markdownComponents}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
              {canInsertMessageContent(msg) && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      void handleInsert(msg);
                    }}
                    disabled={insertingMessageId === msg.id}
                    className="flex-1 py-1.5 bg-white dark:bg-[#27272A] border border-slate-200 dark:border-[#3f3f46] rounded-md text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors flex items-center justify-center gap-1 disabled:opacity-60 disabled:cursor-wait"
                  >
                    {insertingMessageId === msg.id ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> 正在插入：{insertionProgressText || '处理中...'}
                      </>
                    ) : (
                      <>
                        <Check size={12} /> 插入到文档末尾
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg)}
                    className="py-1.5 px-2.5 bg-white dark:bg-[#27272A] border border-slate-200 dark:border-[#3f3f46] rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors flex items-center gap-1 shrink-0"
                    title="复制回复正文"
                  >
                    {copiedMessageId === msg.id ? (
                      <>
                        <Check size={12} className="text-emerald-500" />
                        <span className="text-emerald-500">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            {msg.status === 'error' && (
              <div className="flex items-center gap-2 text-xs text-amber-500">
                <AlertTriangle size={12} />
                <button onClick={handleRetry} className="underline">重试</button>
                {msg.errorDetail && (
                  <button
                    onClick={() => navigator.clipboard?.writeText(msg.errorDetail || '')}
                    className="underline"
                  >
                    复制详情
                  </button>
                )}
                {onOpenAICenter && (
                  <button onClick={onOpenAICenter} className="underline">去配置</button>
                )}
              </div>
            )}
            <span className={`text-[11px] text-slate-400 ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
              {msg.timestamp}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-[#27272A] bg-slate-50 dark:bg-[#18181B]">
        {/* Quick prompt templates chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2 custom-scrollbar">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setInput((prev) => (prev ? `${item.prompt}${prev}` : item.prompt))}
              className="shrink-0 px-2 py-0.5 text-[11px] font-medium rounded-md bg-white dark:bg-[#27272A] border border-slate-200/80 dark:border-[#3f3f46] text-slate-600 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="text-[11px] font-semibold text-slate-400 shrink-0"
            title="本次参考资料：只影响这一次提问会带给 AI 的正文内容，不影响上方历史保存位置"
          >
            本次参考
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {contextScopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateChatPreferences({ contextScope: option.value })}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-md border whitespace-nowrap transition-colors',
                  chatPreferences.contextScope === option.value
                    ? 'border-accent text-accent bg-accent-subtle font-medium shadow-xs'
                    : 'border-slate-200 dark:border-[#27272A] text-slate-500 hover:text-slate-700 dark:text-slate-400'
                )}
                title={option.title}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-white dark:bg-[#0E0E11] border border-slate-200 dark:border-[#27272A] rounded-xl text-[13px] leading-5 py-3 pl-3 pr-10 resize-none focus:ring-1 ring-accent focus-border-accent min-h-[110px] custom-scrollbar text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-shadow"
            placeholder="询问 AI 或输入指令 (Enter 发送...)"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          ></textarea>
          <button
            onClick={() => (isLoading ? handleStop() : handleSend())}
            disabled={(!input.trim() && !isLoading) || (!configReady && !isLoading)}
            className={cn(
              "absolute bottom-2.5 right-2.5 p-1.5 text-white rounded-lg shadow-md transition-all active:scale-95",
              isLoading
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-accent hover:bg-accent-strong",
              ((!input.trim() && !isLoading) || (!configReady && !isLoading)) && "opacity-50 cursor-not-allowed"
            )}
            title={isLoading ? '停止生成' : '发送'}
          >
            {isLoading ? <StopCircle size={14} /> : <Send size={14} />}
          </button>
        </div>
        {failedRequest && (
          <div className="flex items-center justify-end mt-2 px-1">
            <button onClick={handleRetry} className="text-[11px] text-amber-500 flex items-center gap-1 hover:underline">
              <RefreshCw size={12} /> 重试上次请求
            </button>
          </div>
        )}
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="AI 图片预览"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="关闭图片预览"
            title="关闭"
          >
            <X size={22} />
          </button>
          <img
            src={imagePreview.src}
            alt={imagePreview.alt}
            className="max-h-[86vh] max-w-[90vw] rounded-2xl bg-white object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          <div className="absolute bottom-5 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-full bg-black/35 px-4 py-2 text-xs text-white/90">
            {imagePreview.alt || 'AI 生成图片'} · 点击空白处或按 Esc 关闭
          </div>
        </div>
      )}
    </aside>
  );
}

export default React.memo(SidebarRightComponent);





