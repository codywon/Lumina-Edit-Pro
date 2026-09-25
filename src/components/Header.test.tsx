import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Header from './Header';
import { SettingsProvider } from '../contexts/SettingsContext';

function ensureMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function createEditor() {
  const chain = {
    focus: vi.fn(() => chain),
    undo: vi.fn(() => chain),
    redo: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleStrike: vi.fn(() => chain),
    toggleCode: vi.fn(() => chain),
    toggleBlockquote: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    setHorizontalRule: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    setImage: vi.fn(() => chain),
    run: vi.fn(() => true),
  };

  return {
    chain: vi.fn(() => chain),
    getAttributes: vi.fn(() => ({ language: 'auto' })),
    isActive: vi.fn(() => false),
  };
}

function renderHeader(overrides: Record<string, unknown> = {}) {
  const props = {
    viewMode: 'wysiwyg',
    setViewMode: vi.fn(),
    aiPanelOpen: false,
    setAiPanelOpen: vi.fn(),
    leftPanelOpen: true,
    setLeftPanelOpen: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAICenter: vi.fn(),
    onOpenAbout: vi.fn(),
    content: '# 文档',
    showToast: vi.fn(),
    onSave: vi.fn(),
    onNewFile: vi.fn(),
    onOpenFile: vi.fn(),
    onSearch: vi.fn(),
    searchOptions: { caseSensitive: false, wholeWord: false },
    searchMatchCount: 0,
    searchActiveMatchIndex: 0,
    onSearchNavigate: vi.fn(),
    onSearchOptionsChange: vi.fn(),
    onToggleFocusMode: vi.fn(),
    onWindowMinimize: vi.fn(),
    onWindowToggleMaximize: vi.fn(),
    onWindowClose: vi.fn(),
    onWindowStartDrag: vi.fn(),
    isToolbarVisible: true,
    setIsToolbarVisible: vi.fn(),
    onToggleFullscreen: vi.fn(),
    editor: createEditor(),
    ...overrides,
  };

  return {
    ...props,
    ...render(
      <SettingsProvider>
        <Header {...(props as any)} />
      </SettingsProvider>
    ),
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  ensureMatchMedia();
});

describe('Header menu command model', () => {
  it('renders an integrated draggable titlebar with menus and window controls only', () => {
    const onWindowMinimize = vi.fn();
    const onWindowToggleMaximize = vi.fn();
    const onWindowClose = vi.fn();

    renderHeader({
      onWindowMinimize,
      onWindowToggleMaximize,
      onWindowClose,
    });

    const titlebar = screen.getByLabelText('应用标题栏');
    expect(screen.getByLabelText('Lumina Edit Pro 图标')).toHaveAttribute('data-brand-icon', 'lumina');
    expect(titlebar).toHaveAttribute('data-tauri-drag-region');
    expect(screen.getByRole('navigation', { name: '主菜单' })).toBeInTheDocument();
    expect(screen.queryByLabelText('用户')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '隐藏编辑工具栏' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入专注模式' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }));
    fireEvent.click(screen.getByRole('button', { name: '最大化或还原窗口' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }));

    expect(screen.getByRole('button', { name: '最大化或还原窗口' }).querySelector('.lucide-square')).not.toBeNull();
    expect(onWindowMinimize).toHaveBeenCalledTimes(1);
    expect(onWindowToggleMaximize).toHaveBeenCalledTimes(1);
    expect(onWindowClose).toHaveBeenCalledTimes(1);
  });

  it('marks safe non-interactive titlebar zones as drag regions while keeping menus clickable', () => {
    const onWindowStartDrag = vi.fn();

    renderHeader({ onWindowStartDrag });

    const brandDragRegion = screen.getByLabelText('应用品牌拖拽区');
    const blankDragRegion = screen.getByLabelText('标题栏空白拖拽区');

    expect(brandDragRegion).toHaveAttribute('data-tauri-drag-region');
    expect(blankDragRegion).toHaveAttribute('data-tauri-drag-region');
    expect(screen.getByRole('button', { name: '文件' })).not.toHaveAttribute('data-tauri-drag-region');

    fireEvent.pointerDown(brandDragRegion, { button: 0 });
    fireEvent.pointerDown(blankDragRegion, { button: 0 });
    fireEvent.pointerDown(screen.getByRole('button', { name: '文件' }), { button: 0 });
    const rightClickEvent = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(rightClickEvent, 'button', { value: 2 });
    fireEvent(blankDragRegion, rightClickEvent);

    expect(onWindowStartDrag).toHaveBeenCalledTimes(2);
  });

  it('toggles window maximize on titlebar blank-area double click without starting another drag', () => {
    const onWindowStartDrag = vi.fn();
    const onWindowToggleMaximize = vi.fn();

    renderHeader({ onWindowStartDrag, onWindowToggleMaximize });

    const blankDragRegion = screen.getByLabelText('标题栏空白拖拽区');

    fireEvent.pointerDown(blankDragRegion, { button: 0, detail: 1 });
    fireEvent.pointerDown(blankDragRegion, { button: 0, detail: 2 });

    expect(onWindowStartDrag).toHaveBeenCalledTimes(1);
    expect(onWindowToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('allows dragging from top menu buttons after pointer movement without breaking simple menu clicks', () => {
    const onWindowStartDrag = vi.fn();

    renderHeader({ onWindowStartDrag });

    const fileMenuButton = screen.getByRole('button', { name: '文件' });

    fireEvent.pointerDown(fileMenuButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(fileMenuButton, { clientX: 24, clientY: 11 });
    fireEvent.click(fileMenuButton);

    expect(onWindowStartDrag).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /新建文件/ })).not.toBeInTheDocument();

    fireEvent.pointerDown(fileMenuButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(fileMenuButton);
    fireEvent.click(fileMenuButton);

    expect(screen.getByRole('button', { name: /新建文件/ })).toBeInTheDocument();
  });

  it('does not render a user avatar in the titlebar', () => {
    renderHeader();

    expect(screen.queryByLabelText('用户')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /user/i })).not.toBeInTheDocument();
  });

  it('does not render the placeholder notification bell in the titlebar', () => {
    const { container } = renderHeader();

    expect(container.querySelector('.lucide-bell')).not.toBeInTheDocument();
  });

  it('renders the top-level menus in a stable explicit order with 设置 before 帮助', () => {
    renderHeader();

    const nav = screen.getByRole('navigation', { name: '主菜单' });
    const menuLabels = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(menuLabels).toEqual(['文件', '编辑', '视图', '插入', '格式', '设置', '帮助']);
  });

  it('uses real handlers for visible settings commands and removes placeholder-only entries', () => {
    const onOpenSettings = vi.fn();
    const onOpenAICenter = vi.fn();
    const onOpenAbout = vi.fn();

    renderHeader({ onOpenSettings, onOpenAICenter, onOpenAbout });

    fireEvent.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.queryByRole('button', { name: '功能配置' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '通用设置' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: 'AI 能力中心' }));
    expect(onOpenAICenter).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '帮助' }));
    expect(screen.queryByRole('button', { name: '检查更新' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用说明' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关于' }));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it('routes the view fullscreen command through the real fullscreen toggle handler', () => {
    const onToggleFullscreen = vi.fn();
    const showToast = vi.fn();

    renderHeader({ onToggleFullscreen, showToast });

    fireEvent.click(screen.getByRole('button', { name: '视图' }));
    fireEvent.click(screen.getByRole('button', { name: /全屏/ }));

    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalledWith('全屏');
  });

  it('routes horizontal rule command through the format menu', () => {
    const editor = createEditor();
    const chain = editor.chain();

    renderHeader({ editor });

    fireEvent.click(screen.getByRole('button', { name: '格式' }));
    fireEvent.click(screen.getByRole('button', { name: '分割线' }));

    expect(chain.setHorizontalRule).toHaveBeenCalled();
  });
});

describe('Header document search', () => {
  it('describes the header search box as searching the current document', () => {
    renderHeader();

    const input = screen.getByRole('searchbox');

    expect(input).toHaveAttribute('placeholder');
    expect(input).toHaveAttribute('aria-label');
    expect(input.getAttribute('placeholder')).toBe(input.getAttribute('aria-label'));
    expect(input).toHaveAttribute('placeholder', '搜索当前文档');
  });

  it('widens the document search box while it is active or has a query', () => {
    renderHeader();

    const input = screen.getByRole('searchbox', { name: '搜索当前文档' });

    expect(input).toHaveClass('w-48');
    expect(input).not.toHaveClass('w-72');

    fireEvent.focus(input);

    expect(input).toHaveClass('w-72');
    expect(input).not.toHaveClass('w-48');

    fireEvent.blur(input, { relatedTarget: null });
    fireEvent.change(input, { target: { value: '标题' } });

    expect(input).toHaveClass('w-72');
  });

  it('submits trimmed queries and clears document search when the input is emptied', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();

    renderHeader({ onSearch });

    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: '  标题  ' } });
    vi.runAllTimers();

    expect(onSearch).toHaveBeenCalledWith('标题');

    fireEvent.change(input, { target: { value: '' } });

    expect(onSearch).toHaveBeenCalledWith('');
    vi.useRealTimers();
  });

  it('submits trimmed queries from the search form', () => {
    const onSearch = vi.fn();
    renderHeader({ onSearch });

    const input = screen.getByRole('searchbox', { name: '搜索当前文档' });
    const form = screen.getByRole('search', { name: '文档搜索' });

    fireEvent.change(input, { target: { value: '  标题  ' } });
    fireEvent.submit(form);

    expect(onSearch).toHaveBeenCalledWith('标题');
  });

  it('shows search controls for navigation and match options', () => {
    const onSearchNavigate = vi.fn();
    const onSearchOptionsChange = vi.fn();

    renderHeader({ onSearchNavigate, onSearchOptionsChange, searchMatchCount: 2 });

    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);

    fireEvent.click(screen.getByTitle('上一个匹配'));
    fireEvent.click(screen.getByTitle('下一个匹配'));
    fireEvent.click(screen.getByTitle('大小写匹配'));
    fireEvent.click(screen.getByTitle('全词匹配'));

    expect(onSearchNavigate).toHaveBeenCalledWith('prev');
    expect(onSearchNavigate).toHaveBeenCalledWith('next');
    expect(onSearchOptionsChange).toHaveBeenCalledWith({ caseSensitive: true });
    expect(onSearchOptionsChange).toHaveBeenCalledWith({ wholeWord: true });
  });

  it('shows the active search match as current over total instead of only total count', () => {
    renderHeader({ searchMatchCount: 69, searchActiveMatchIndex: 3 });

    const input = screen.getByRole('searchbox');
    fireEvent.focus(input);

    expect(screen.getByText('3 / 69')).toBeInTheDocument();
  });
});
