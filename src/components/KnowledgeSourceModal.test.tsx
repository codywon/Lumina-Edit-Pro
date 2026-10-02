import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import KnowledgeSourceModal from './KnowledgeSourceModal';
import * as knowledgeLib from '../lib/knowledge';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('KnowledgeSourceModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <KnowledgeSourceModal
        isOpen={false}
        onClose={vi.fn()}
        showToast={vi.fn()}
        onInsertAtCursor={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders correctly when open with initial state', () => {
    render(
      <KnowledgeSourceModal
        isOpen={true}
        onClose={vi.fn()}
        showToast={vi.fn()}
        onInsertAtCursor={vi.fn()}
      />
    );

    expect(screen.getByText('知识来源与网页剪藏')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/https:\/\/mp\.weixin\.qq\.com\/\.\.\. 或 小红书 \/ 飞书链接\.\.\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /解析链接/ })).toBeInTheDocument();
  });

  it('detects platform badge dynamically as user types URL', () => {
    render(
      <KnowledgeSourceModal
        isOpen={true}
        onClose={vi.fn()}
        showToast={vi.fn()}
        onInsertAtCursor={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/https:\/\/mp\.weixin\.qq\.com\/\.\.\. 或 小红书 \/ 飞书链接\.\.\./);

    // WeChat
    fireEvent.change(input, { target: { value: 'https://mp.weixin.qq.com/s/sample' } });
    expect(screen.getByText('微信公众号')).toBeInTheDocument();

    // Xiaohongshu
    fireEvent.change(input, { target: { value: 'https://www.xiaohongshu.com/explore/note123' } });
    expect(screen.getByText('小红书')).toBeInTheDocument();

    // Feishu
    fireEvent.change(input, { target: { value: 'https://test.feishu.cn/docx/dox123' } });
    expect(screen.getByText('飞书文档')).toBeInTheDocument();
  });

  it('extracts article and shows preview card with save options', async () => {
    const mockExtract = vi.spyOn(knowledgeLib, 'extractArticleFromUrl').mockResolvedValue({
      metadata: {
        title: '测试微信文章',
        author: '测试作者',
        publishDate: '2026-03-01',
        sourceUrl: 'https://mp.weixin.qq.com/s/sample',
        platform: 'wechat',
        clippedAt: '2026-03-01T12:00:00.000Z',
      },
      markdown: '这是文章正文内容。',
      images: ['https://mmbiz.qpic.cn/img1.png'],
    });

    const showToast = vi.fn();
    const onCreateWorkspaceDocument = vi.fn().mockResolvedValue(true);

    render(
      <KnowledgeSourceModal
        isOpen={true}
        onClose={vi.fn()}
        showToast={showToast}
        onInsertAtCursor={vi.fn()}
        onCreateWorkspaceDocument={onCreateWorkspaceDocument}
        hasActiveWorkspace={true}
      />
    );

    const input = screen.getByPlaceholderText(/https:\/\/mp\.weixin\.qq\.com\/\.\.\. 或 小红书 \/ 飞书链接\.\.\./);
    fireEvent.change(input, { target: { value: 'https://mp.weixin.qq.com/s/sample' } });

    const extractBtn = screen.getByRole('button', { name: /解析链接/ });
    fireEvent.click(extractBtn);

    await waitFor(() => {
      expect(mockExtract).toHaveBeenCalledWith('https://mp.weixin.qq.com/s/sample');
      expect(screen.getByDisplayValue('测试微信文章')).toBeInTheDocument();
      expect(screen.getByText(/作者: 测试作者/)).toBeInTheDocument();
      expect(screen.getByText(/1 张图片\/贴图/)).toBeInTheDocument();
      expect(screen.getByText(/这是文章正文内容/)).toBeInTheDocument();
    });

    // Check save options are visible
    expect(screen.getByText('保存选项与落盘配置')).toBeInTheDocument();
    expect(screen.getByText('新建工作区文档 (推荐)')).toBeInTheDocument();
    expect(screen.getByText('插入到当前文档')).toBeInTheDocument();

    // Click confirm save
    const saveBtn = screen.getByRole('button', { name: /新建文档并导入/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onCreateWorkspaceDocument).toHaveBeenCalled();
    });
  });

  it('supports insert at cursor mode', async () => {
    vi.spyOn(knowledgeLib, 'extractArticleFromUrl').mockResolvedValue({
      metadata: {
        title: '小红书贴图笔记',
        sourceUrl: 'https://www.xiaohongshu.com/explore/123',
        platform: 'xiaohongshu',
        clippedAt: '2026-03-01T12:00:00.000Z',
      },
      markdown: '小红书正文...',
      images: [],
    });

    const onInsertAtCursor = vi.fn();
    const onClose = vi.fn();

    render(
      <KnowledgeSourceModal
        isOpen={true}
        onClose={onClose}
        showToast={vi.fn()}
        onInsertAtCursor={onInsertAtCursor}
        hasActiveWorkspace={false}
      />
    );

    const input = screen.getByPlaceholderText(/https:\/\/mp\.weixin\.qq\.com\/\.\.\. 或 小红书 \/ 飞书链接\.\.\./);
    fireEvent.change(input, { target: { value: 'https://www.xiaohongshu.com/explore/123' } });

    fireEvent.click(screen.getByRole('button', { name: /解析链接/ }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('小红书贴图笔记')).toBeInTheDocument();
    });

    // Switch to or default insert-cursor
    const insertBtn = screen.getByRole('button', { name: /插入到当前文档/ });
    fireEvent.click(insertBtn);

    await waitFor(() => {
      expect(onInsertAtCursor).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error message if URL is empty or invalid', async () => {
    render(
      <KnowledgeSourceModal
        isOpen={true}
        onClose={vi.fn()}
        showToast={vi.fn()}
        onInsertAtCursor={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/https:\/\/mp\.weixin\.qq\.com\/\.\.\. 或 小红书 \/ 飞书链接\.\.\./);
    fireEvent.change(input, { target: { value: 'invalid-url-string' } });

    fireEvent.click(screen.getByRole('button', { name: /解析链接/ }));

    await waitFor(() => {
      expect(screen.getByText('链接必须以 http:// 或 https:// 开头')).toBeInTheDocument();
    });
  });
});
