import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockCreateChatCompletion,
  mockCreateImageGeneration,
  mockSetChatHistoryForDoc,
  mockMarkTemplateUsed,
  mockUpdateChatPreferences,
  mockUpdateMemory,
  mockAIState,
} = vi.hoisted(() => {
  const state = {
    provider: {
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test-key',
      defaultModel: 'gpt-5.5',
      imageModel: 'gpt-image-2',
      imageSize: 'auto' as const,
      imageQuality: 'auto' as const,
      modelSource: 'remote' as const,
      models: [{ id: 'gpt-5.5' }],
      modelContextWindows: {},
    },
    chatPreferences: {
      contextScope: 'document' as const,
      sessionScope: 'document' as const,
      useMemory: false,
      stream: true,
      autoSummarize: false,
      historySearchEnabled: false,
      historySearchScope: 'current' as const,
      contextWindowTokens: 200000,
      contextWarnRatio: 0.8,
      docSearchEnabled: false,
    },
    templates: {
      templates: [],
      recent: [],
      defaultTemplateId: null,
    },
    memory: {
      enabled: false,
      fixedInstructionEnabled: true,
      fixedInstruction: '',
      preferencesEnabled: true,
      preferences: [],
      summary: '',
    },
    chatHistory: {},
    connectionTest: null,
    updateProvider: vi.fn(),
    updateChatPreferences: vi.fn(),
    updateTemplates: vi.fn(),
    resetTemplates: vi.fn(),
    setDefaultTemplateId: vi.fn(),
    updateTemplate: vi.fn(),
    removeTemplate: vi.fn(),
    markTemplateUsed: vi.fn(),
    updateMemory: vi.fn(),
    setChatHistoryForDoc: vi.fn(),
    clearChatHistory: vi.fn(),
    setConnectionTest: vi.fn(),
  };

  return {
    mockCreateChatCompletion: vi.fn(),
    mockCreateImageGeneration: vi.fn(),
    mockSetChatHistoryForDoc: state.setChatHistoryForDoc,
    mockMarkTemplateUsed: state.markTemplateUsed,
    mockUpdateChatPreferences: state.updateChatPreferences,
    mockUpdateMemory: state.updateMemory,
    mockAIState: state,
  };
});

vi.mock('../contexts/AIContext', () => ({
  useAI: () => mockAIState,
}));

vi.mock('../lib/ai/promptBuilder', () => ({
  buildPromptMessages: vi.fn(async () => ({
    messages: [{ role: 'user', content: '生成图' }],
    truncated: false,
    compressed: false,
    historyUsed: false,
    docSearchUsed: false,
    summaryUpdate: '',
  })),
}));

vi.mock('../lib/ai/contextCompression', () => ({
  summarizeContextWithModel: vi.fn(),
}));

vi.mock('../lib/ai/openaiClient', async () => {
  const actual = await vi.importActual<typeof import('../lib/ai/openaiClient')>('../lib/ai/openaiClient');
  return {
    ...actual,
    createChatCompletion: mockCreateChatCompletion,
    createImageGeneration: mockCreateImageGeneration,
  };
});

import SidebarRight from './SidebarRight';

function renderSidebar(overrides: Partial<React.ComponentProps<typeof SidebarRight>> = {}) {
  return render(
    <SidebarRight
      content="正文"
      setContent={vi.fn()}
      documentId="doc-1"
      {...overrides}
    />
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockAIState.chatHistory = {};
  mockAIState.templates = { templates: [], recent: [], defaultTemplateId: null };
  mockAIState.chatPreferences = {
    ...mockAIState.chatPreferences,
    contextScope: 'document',
    sessionScope: 'document',
    stream: true,
    historySearchEnabled: false,
    docSearchEnabled: false,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SidebarRight AI insertion', () => {
  it('does not offer inserting the empty-response placeholder into the document', () => {
    mockAIState.chatHistory = {
      'doc:doc-1': [
        {
          id: 'assistant-empty',
          role: 'assistant',
          content: '未返回内容',
          timestamp: '17:57',
        },
      ],
    };

    renderSidebar();

    expect(screen.getByText('未返回内容')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /插入到文档末尾/ })).not.toBeInTheDocument();
  });

  it('keeps streamed image markdown when the final response body is empty', async () => {
    const setContent = vi.fn();
    const streamedMarkdown = '已生成图片，可插入文档。\n\n![总结图](data:image/png;base64,AAA)';
    mockCreateChatCompletion.mockImplementation(async (_request, handlers) => {
      handlers.onDelta?.(streamedMarkdown);
      return { content: '', usedStream: true, usedFallback: false };
    });

    renderSidebar({ setContent });

    fireEvent.change(screen.getByPlaceholderText(/询问 AI/), { target: { value: '写一段内容' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/询问 AI/), { key: 'Enter' });

    await waitFor(() =>
      expect(mockSetChatHistoryForDoc).toHaveBeenLastCalledWith(
        'doc:doc-1',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            content: streamedMarkdown,
          }),
        ])
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /插入到文档末尾/ }));

    await waitFor(() => expect(setContent).toHaveBeenCalledWith('正文\n\n![总结图](data:image/png;base64,AAA)'));
    expect(screen.queryByText('未返回内容')).not.toBeInTheDocument();
  });

  it('persists generated image history with the local asset link returned by the app shell', async () => {
    const streamedMarkdown = '已生成图片，可插入文档。\n\n![总结图](data:image/png;base64,AAA)';
    const localAssetMarkdown = '已生成图片，可插入文档。\n\n![总结图](assets/ai-image-1.png)';
    const onPersistGeneratedAssets = vi.fn(async () => localAssetMarkdown);
    mockCreateChatCompletion.mockImplementation(async (_request, handlers) => {
      handlers.onDelta?.(streamedMarkdown);
      return { content: '', usedStream: true, usedFallback: false };
    });

    renderSidebar({ onPersistGeneratedAssets });

    fireEvent.change(screen.getByPlaceholderText(/询问 AI/), { target: { value: '写一段内容' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/询问 AI/), { key: 'Enter' });

    await waitFor(() => expect(onPersistGeneratedAssets).toHaveBeenCalledWith(streamedMarkdown));
    await waitFor(() =>
      expect(mockSetChatHistoryForDoc).toHaveBeenLastCalledWith(
        'doc:doc-1',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            content: localAssetMarkdown,
          }),
        ])
      )
    );
    expect(screen.getByText('已生成图片，可插入文档。')).toBeInTheDocument();
  });

  it('routes image requests to the non-streaming image API instead of chat streaming', async () => {
    const imageMarkdown = '已生成图片，可插入文档。\n\n![AI 生成图片](data:image/png;base64,AAA)';
    mockCreateImageGeneration.mockResolvedValue({ imageMarkdown });

    renderSidebar({ content: '# 文档标题\n正文内容' });

    fireEvent.change(screen.getByPlaceholderText(/询问 AI/), { target: { value: '针对文章生成一张总结图' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/询问 AI/), { key: 'Enter' });

    await waitFor(() =>
      expect(mockCreateImageGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-image-2',
          size: 'auto',
          quality: 'auto',
          prompt: expect.stringContaining('针对文章生成一张总结图'),
        })
      )
    );
    expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockSetChatHistoryForDoc).toHaveBeenLastCalledWith(
        'doc:doc-1',
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            content: imageMarkdown,
          }),
        ])
      )
    );
  });

  it('shows insertion progress while appending content', async () => {
    let resolveInsert: (() => void) | null = null;
    const onInsertAtEnd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInsert = resolve;
        })
    );
    mockAIState.chatHistory = {
      'doc:doc-1': [
        {
          id: 'assistant-image',
          role: 'assistant',
          content: '已生成图片，可插入文档。\n\n![总结图](data:image/png;base64,AAA)',
          timestamp: '00:34',
        },
      ],
    };

    renderSidebar({ onInsertAtEnd });

    fireEvent.click(screen.getByRole('button', { name: /插入到文档末尾/ }));

    expect(await screen.findByRole('button', { name: /正在插入/ })).toBeDisabled();

    await waitFor(() => expect(onInsertAtEnd).toHaveBeenCalledTimes(1));
    resolveInsert!();

    await waitFor(() => expect(screen.getByRole('button', { name: /插入到文档末尾/ })).toBeEnabled());
  });

  it('shows a failure toast when appending content fails', async () => {
    const showToast = vi.fn();
    mockAIState.chatHistory = {
      'doc:doc-1': [
        {
          id: 'assistant-image',
          role: 'assistant',
          content: '已生成图片，可插入文档。\n\n![总结图](data:image/png;base64,AAA)',
          timestamp: '00:34',
        },
      ],
    };

    renderSidebar({
      onInsertAtEnd: vi.fn(async () => {
        throw new Error('insert failed');
      }),
      showToast,
    });

    fireEvent.click(screen.getByRole('button', { name: /插入到文档末尾/ }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('插入失败，请稍后重试', 'error'));
  });

  it('refreshes visible history when persistent chat history hydrates after panel mount', async () => {
    mockAIState.chatHistory = {
      'doc:doc-1': [
        {
          id: 'user-old',
          role: 'user',
          content: '针对文章生成一张总结图',
          timestamp: '00:33',
        },
      ],
    };

    const { rerender } = renderSidebar();

    expect(screen.getByText('针对文章生成一张总结图')).toBeInTheDocument();
    expect(screen.queryByText('已生成图片，可插入文档。')).not.toBeInTheDocument();

    mockAIState.chatHistory = {
      'doc:doc-1': [
        {
          id: 'user-old',
          role: 'user',
          content: '针对文章生成一张总结图',
          timestamp: '00:33',
        },
        {
          id: 'assistant-image',
          role: 'assistant',
          content: '已生成图片，可插入文档。\n\n![总结图](data:image/png;base64,AAA)',
          timestamp: '00:34',
        },
      ],
    };

    rerender(
      <SidebarRight
        content="正文"
        setContent={vi.fn()}
        documentId="doc-1"
      />
    );

    expect(await screen.findByText('已生成图片，可插入文档。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /插入到文档末尾/ })).toBeInTheDocument();
  });
});
