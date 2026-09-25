import type { AIContextScope, AIMemoryState, AIMessage, AITemplate } from './types';

export const MAX_CONTEXT_CHARS = 4000;
export const DEFAULT_CONTEXT_BUDGET_TOKENS = 200000;
export const DEFAULT_CONTEXT_WARN_RATIO = 0.8;

const MIN_CONTEXT_CHARS = 600;
const DEFAULT_HISTORY_MAX_HITS = 6;
const DEFAULT_HISTORY_MAX_CHARS = 160;
const DEFAULT_DOC_SEARCH_MAX_HITS = 4;
const DEFAULT_DOC_SEARCH_MAX_CHARS = 240;
const SUMMARY_SOURCE_MAX_CHARS = 12000;

export interface HistorySearchItem extends AIMessage {
  docId?: string;
}

export interface HistorySearchOptions {
  maxHits?: number;
  maxChars?: number;
}

export interface ContextBudgetOptions {
  maxTokens?: number;
  warnRatio?: number;
  autoSummarize?: boolean;
  summarizeDocument?: boolean;
}

export interface PromptBuildInput {
  memory: AIMemoryState;
  template?: AITemplate | null;
  contextScope: AIContextScope;
  documentText: string;
  selectionText: string;
  userInput: string;
  history?: HistorySearchItem[];
  historySearchEnabled?: boolean;
  historySearchQuery?: string;
  historySearchOptions?: HistorySearchOptions;
  documentSearchContext?: string;
  contextBudget?: ContextBudgetOptions;
  summarize?: (text: string) => Promise<string>;
}

export interface PromptBuildResult {
  messages: { role: 'system' | 'user'; content: string }[];
  truncated: boolean;
  compressed: boolean;
  historyUsed: boolean;
  docSearchUsed: boolean;
  summaryUpdate?: string;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function normalizeQuery(query: string) {
  return query.replace(/\s+/g, ' ').trim();
}

function extractKeywords(query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const hasSpace = /\s/.test(normalized);
  let tokens = normalized.split(' ').map((item) => item.trim()).filter(Boolean);
  if (!hasSpace && normalized.length >= 2) {
    tokens = [normalized];
  }
  const filtered = tokens.filter((item) => item.length >= 2);
  return filtered.length ? filtered : normalized.length >= 2 ? [normalized] : [];
}

function buildExcerpt(content: string, keywords: string[], maxChars: number) {
  if (!content) return '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  for (const keyword of keywords) {
    const index = lower.indexOf(keyword.toLowerCase());
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
    }
  }
  if (matchIndex < 0) {
    return normalized.slice(0, maxChars);
  }
  const prefix = Math.max(matchIndex - Math.floor(maxChars * 0.2), 0);
  const start = Math.min(prefix, Math.max(normalized.length - maxChars, 0));
  const end = Math.min(start + maxChars, normalized.length);
  let excerpt = normalized.slice(start, end);
  if (start > 0) excerpt = `…${excerpt}`;
  if (end < normalized.length) excerpt = `${excerpt}…`;
  return excerpt;
}

function buildDocumentSearchSnippets(content: string, query: string) {
  const keywords = extractKeywords(query);
  if (!keywords.length) return '';
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  const snippets: string[] = [];
  let cursor = 0;
  for (let i = 0; i < DEFAULT_DOC_SEARCH_MAX_HITS; i += 1) {
    let matchIndex = -1;
    let matchLen = 0;
    for (const keyword of keywords) {
      const index = lower.indexOf(keyword.toLowerCase(), cursor);
      if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
        matchIndex = index;
        matchLen = keyword.length;
      }
    }
    if (matchIndex < 0) break;
    const prefix = Math.max(matchIndex - Math.floor(DEFAULT_DOC_SEARCH_MAX_CHARS * 0.25), 0);
    const start = Math.min(prefix, Math.max(normalized.length - DEFAULT_DOC_SEARCH_MAX_CHARS, 0));
    const end = Math.min(start + DEFAULT_DOC_SEARCH_MAX_CHARS, normalized.length);
    let excerpt = normalized.slice(start, end);
    if (start > 0) excerpt = `…${excerpt}`;
    if (end < normalized.length) excerpt = `${excerpt}…`;
    snippets.push(`- ${excerpt}`);
    cursor = matchIndex + matchLen;
  }
  if (!snippets.length) return '';
  return `文档检索片段：\n${snippets.join('\n')}`;
}

function buildSummarySource(content: string, maxChars: number) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  const headLen = Math.floor(maxChars * 0.6);
  const tailLen = Math.max(maxChars - headLen, 0);
  const head = normalized.slice(0, headLen);
  const tail = tailLen > 0 ? normalized.slice(-tailLen) : '';
  return `${head}\n...\n${tail}`;
}

function formatDocLabel(docId?: string) {
  if (!docId) return '';
  const normalized = docId.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const label = parts[parts.length - 1] || normalized;
  return `【${label}】`;
}

export function buildHistorySearchContext(
  history: HistorySearchItem[],
  query: string,
  options: HistorySearchOptions = {}
) {
  const keywords = extractKeywords(query);
  if (!keywords.length) return '';
  const maxHits = options.maxHits ?? DEFAULT_HISTORY_MAX_HITS;
  const maxChars = options.maxChars ?? DEFAULT_HISTORY_MAX_CHARS;

  const matches: string[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (!item || !item.content) continue;
    if (item.role === 'system') continue;
    const haystack = item.content.toLowerCase();
    if (!keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) continue;
    const excerpt = buildExcerpt(item.content, keywords, maxChars);
    if (!excerpt) continue;
    const roleLabel = item.role === 'user' ? '用户' : '助手';
    const docLabel = formatDocLabel(item.docId);
    matches.push(`- ${docLabel}${roleLabel}：${excerpt}`);
    if (matches.length >= maxHits) break;
  }

  if (!matches.length) return '';
  return `历史记录（检索）：\n${matches.join('\n')}`;
}

function buildUserContent(
  scope: AIContextScope,
  documentText: string,
  selectionText: string,
  userInput: string,
  contextLimit: number
) {
  const parts: string[] = [];
  let truncated = false;

  if (scope === 'document') {
    const text = documentText ?? '';
    if (text.trim()) {
      if (text.length > contextLimit) {
        truncated = true;
        parts.push(`文档内容：\n${text.slice(0, contextLimit)}`);
      } else {
        parts.push(`文档内容：\n${text}`);
      }
    }
  }

  if (scope === 'selection' && selectionText.trim()) {
    const text = selectionText ?? '';
    if (text.length > contextLimit) {
      truncated = true;
      parts.push(`选中文本：\n${text.slice(0, contextLimit)}`);
    } else {
      parts.push(`选中文本：\n${text}`);
    }
  }

  if (userInput.trim()) {
    parts.push(`用户输入：\n${userInput.trim()}`);
  }

  return { content: parts.filter(Boolean).join('\n\n'), truncated };
}

function buildSystemMessages(
  fixedInstruction: string,
  persistentSummary: string,
  memorySummary: string,
  preferences: string,
  template: string,
  historyContext: string,
  documentSearchContext: string
) {
  const messages: { role: 'system'; content: string }[] = [];
  if (fixedInstruction) {
    messages.push({ role: 'system', content: fixedInstruction });
  }
  if (memorySummary) {
    messages.push({ role: 'system', content: `记忆摘要：\n${memorySummary}` });
  } else if (persistentSummary) {
    messages.push({ role: 'system', content: `长期记忆：\n${persistentSummary}` });
  }
  if (!memorySummary && preferences) {
    messages.push({ role: 'system', content: preferences });
  }
  if (template) {
    messages.push({ role: 'system', content: template });
  }
  if (historyContext) {
    messages.push({ role: 'system', content: historyContext });
  }
  if (documentSearchContext) {
    messages.push({ role: 'system', content: documentSearchContext });
  }
  return messages;
}

function isAbortError(err: unknown) {
  return err && typeof err === 'object' && (err as Error).name === 'AbortError';
}

export async function buildPromptMessages(input: PromptBuildInput): Promise<PromptBuildResult> {
  const fixedInstruction =
    input.memory.enabled && input.memory.fixedInstructionEnabled && input.memory.fixedInstruction.trim()
      ? input.memory.fixedInstruction.trim()
      : '';
  const persistentSummary =
    input.memory.enabled && input.memory.summary?.trim() ? input.memory.summary.trim() : '';
  const preferences =
    input.memory.enabled && input.memory.preferencesEnabled && input.memory.preferences.length > 0
      ? `用户偏好：\n${input.memory.preferences.map((item) => `- ${item}`).join('\n')}`
      : '';
  const templateText = input.template?.prompt?.trim() ?? '';
  const historyContext =
    input.historySearchEnabled && input.historySearchQuery
      ? buildHistorySearchContext(input.history ?? [], input.historySearchQuery, input.historySearchOptions)
      : '';
  const documentSearchContext = input.documentSearchContext?.trim() ?? '';
  const historyUsed = Boolean(historyContext);
  let docSearchUsed = Boolean(documentSearchContext);

  const budgetTokens = input.contextBudget?.maxTokens ?? DEFAULT_CONTEXT_BUDGET_TOKENS;
  const warnRatio = input.contextBudget?.warnRatio ?? DEFAULT_CONTEXT_WARN_RATIO;
  const autoSummarize = input.contextBudget?.autoSummarize ?? false;
  const summarizeDocument =
    input.contextBudget?.summarizeDocument ?? input.contextBudget?.autoSummarize ?? false;
  const thresholdTokens = Math.floor(budgetTokens * warnRatio);
  const hardContextChars = Math.max(MAX_CONTEXT_CHARS, budgetTokens * 4);

  const baseUser = buildUserContent(
    input.contextScope,
    input.documentText,
    input.selectionText,
    input.userInput,
    hardContextChars
  );
  let userMessageContent = baseUser.content;
  let truncated = baseUser.truncated;
  let compressed = false;
  let summaryUpdate: string | undefined;
  let docSnippetUsed = false;

  let memorySummary = '';
  let systemMessages = buildSystemMessages(
    fixedInstruction,
    persistentSummary,
    memorySummary,
    preferences,
    templateText,
    historyContext,
    documentSearchContext
  );
  let totalTokens =
    systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + estimateTokens(userMessageContent);

  if (
    totalTokens > thresholdTokens &&
    input.contextScope === 'document' &&
    input.userInput.trim()
  ) {
    const docSnippet = buildDocumentSearchSnippets(input.documentText, input.userInput);
    if (docSnippet) {
      docSnippetUsed = true;
      const parts: string[] = [docSnippet];
      if (input.userInput.trim()) {
        parts.push(`用户输入：\n${input.userInput.trim()}`);
      }
      userMessageContent = parts.join('\n\n');
      totalTokens =
        systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) +
        estimateTokens(userMessageContent);
    }
  }

  if (totalTokens > thresholdTokens && autoSummarize && typeof input.summarize === 'function') {
    const compressSourceParts: string[] = [];
    if (preferences) {
      compressSourceParts.push(`偏好记忆：\n${preferences}`);
    }
    if (historyContext) {
      compressSourceParts.push(`历史记录：\n${historyContext}`);
    }
    const compressSource = compressSourceParts.join('\n\n');
    if (compressSource) {
      try {
        const summary = await input.summarize(compressSource);
        if (summary && summary.trim()) {
          memorySummary = summary.trim();
          summaryUpdate = memorySummary;
          compressed = true;
        }
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }
      }
    }
  }

  if (compressed) {
    systemMessages = buildSystemMessages(
      fixedInstruction,
      persistentSummary,
      memorySummary,
      '',
      templateText,
      '',
      documentSearchContext
    );
    totalTokens =
      systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + estimateTokens(userMessageContent);
  }

  if (totalTokens > thresholdTokens && autoSummarize && summarizeDocument && typeof input.summarize === 'function') {
    const sourceText =
      input.contextScope === 'selection'
        ? input.selectionText
        : input.contextScope === 'document'
          ? input.documentText
          : '';
    if (sourceText && sourceText.trim()) {
      try {
        if (docSnippetUsed) {
          // 文档已通过检索片段缩减，无需再触发摘要
        } else {
          const docSource = buildSummarySource(sourceText, SUMMARY_SOURCE_MAX_CHARS);
          const docSummary = await input.summarize(docSource);
          if (docSummary && docSummary.trim()) {
            compressed = true;
            const summaryLabel = input.contextScope === 'selection' ? '选中文本摘要' : '文档摘要';
            const summaryContent = `${summaryLabel}：\n${docSummary.trim()}`;
            const parts: string[] = [];
            parts.push(summaryContent);
            if (input.userInput.trim()) {
              parts.push(`用户输入：\n${input.userInput.trim()}`);
            }
            userMessageContent = parts.join('\n\n');
            totalTokens =
              systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) +
              estimateTokens(userMessageContent);
          }
        }
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }
      }
    }
  }

  if (totalTokens > thresholdTokens && input.contextScope !== 'none') {
    const userInputText = input.userInput.trim() ? `用户输入：\n${input.userInput.trim()}` : '';
    const tokensWithoutContext =
      systemMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0) + estimateTokens(userInputText);
    const remainingTokens = Math.max(thresholdTokens - tokensWithoutContext, 0);
    const contextLimit = Math.max(MIN_CONTEXT_CHARS, Math.floor(remainingTokens * 4));
    const adjusted = buildUserContent(
      input.contextScope,
      input.documentText,
      input.selectionText,
      input.userInput,
      Math.min(hardContextChars, contextLimit)
    );
    userMessageContent = adjusted.content;
    truncated = truncated || adjusted.truncated || contextLimit < hardContextChars;
  }

  const messages: { role: 'system' | 'user'; content: string }[] = [
    ...systemMessages,
    { role: 'user', content: userMessageContent },
  ];

  docSearchUsed = docSearchUsed || docSnippetUsed;

  return {
    messages,
    truncated,
    compressed,
    historyUsed,
    docSearchUsed,
    summaryUpdate,
  };
}
