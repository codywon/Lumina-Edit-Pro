import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DecorationSet } from '@tiptap/pm/view';

const pluginState = vi.hoisted(() => ({
  lastRegisteredPlugin: null as any,
  lastUnregisteredPlugin: null as any,
  decorationCreateCalls: [] as Array<{ doc: any; decorations: any[] }>,
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: ({ className }: { className?: string }) => (
    <div data-testid="editor-content" className={className}>
      Rich editor
    </div>
  ),
  Node: {
    create: vi.fn(() => ({})),
  },
  mergeAttributes: (...attributes: Array<Record<string, unknown>>) => Object.assign({}, ...attributes),
  ReactNodeViewRenderer: () => () => null,
  useEditor: vi.fn(),
}));

vi.mock('@tiptap/pm/state', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    TextSelection: {
      ...actual.TextSelection,
      create: vi.fn((_doc: any, from: number, to: number) => ({ from, to })),
    },
  };
});

import Editor from './Editor';
import { SettingsProvider } from '../contexts/SettingsContext';
import { AIProvider } from '../contexts/AIContext';

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
    setTextSelection: vi.fn(() => chain),
    setHighlight: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleBulletList: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    setImage: vi.fn(() => chain),
    toggleCodeBlock: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    toggleBlockquote: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    toggleOrderedList: vi.fn(() => chain),
    toggleStrike: vi.fn(() => chain),
    setHorizontalRule: vi.fn(() => chain),
    insertContent: vi.fn(() => chain),
    updateAttributes: vi.fn(() => chain),
    setParagraph: vi.fn(() => chain),
    run: vi.fn(() => true),
  };

  const transaction = {
    removeMark: vi.fn(() => transaction),
    setSelection: vi.fn(() => transaction),
    setMeta: vi.fn(() => transaction),
  };

  const editorDoc = {
    descendants: vi.fn(),
    textBetween: vi.fn(() => ''),
    content: {
      size: 42,
    },
    nodeSize: 44,
  };

  const editorDom = document.createElement('div');
  Object.defineProperty(editorDom, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => ({ top: 40, left: 0, right: 0, bottom: 640, width: 800, height: 600, x: 0, y: 40, toJSON: () => ({}) })),
  });

  return {
    chain: vi.fn(() => chain),
    registerPlugin: vi.fn((plugin: any) => {
      pluginState.lastRegisteredPlugin = plugin;
    }),
    unregisterPlugin: vi.fn((pluginKey: any) => {
      pluginState.lastUnregisteredPlugin = pluginKey;
    }),
    schema: {
      marks: {
        highlight: { name: 'highlight' },
      },
    },
    commands: {
      unsetHighlight: vi.fn(),
      setTextSelection: vi.fn(),
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    },
    state: {
      doc: editorDoc,
      selection: {
        from: 1,
        to: 1,
      },
      tr: transaction,
    },
    view: {
      dispatch: vi.fn(),
      focus: vi.fn(),
      domAtPos: vi.fn(() => ({ node: document.createElement('h1') })),
      coordsAtPos: vi.fn(() => ({ top: 240, bottom: 280, left: 0, right: 0 })),
      dom: editorDom,
    },
    getAttributes: vi.fn(() => ({ language: 'auto' })),
    isActive: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function renderEditor(
  viewMode: 'wysiwyg' | 'source' | 'split' = 'split',
  overrides: Record<string, unknown> = {}
) {
  const editor = (overrides.editor as ReturnType<typeof createEditor>) ?? createEditor();

  return {
    editor,
    ...render(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode={viewMode}
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            {...(overrides as any)}
          />
        </AIProvider>
      </SettingsProvider>
    ),
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  pluginState.lastRegisteredPlugin = null;
  pluginState.lastUnregisteredPlugin = null;
  pluginState.decorationCreateCalls = [];
});

beforeEach(() => {
  ensureMatchMedia();
  vi.spyOn(DecorationSet, 'create').mockImplementation((doc: any, decorations: any[]) => {
    pluginState.decorationCreateCalls.push({ doc, decorations });
    return {
      map: vi.fn(() => ({ mapped: true })),
    } as unknown as DecorationSet;
  });
});

describe('Editor rendering modes', () => {
  it('renders a real split mode with source editing and rich-text preview at the same time', () => {
    renderEditor('split');

    const sourceEditor = screen.getByLabelText('Markdown 源码');

    expect(sourceEditor).toBeInTheDocument();
    expect(sourceEditor).toHaveValue('# 标题\n\n内容');
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('does not apply removed line-number styling in the rich editor modes', () => {
    renderEditor('wysiwyg');

    expect(screen.getByTestId('editor-content')).not.toHaveClass('show-line-numbers');
  });

  it('uses full-width adaptive layout in focus mode instead of centering the scroll viewport', () => {
    localStorage.setItem('app-settings', JSON.stringify({ focusMode: true }));

    const { container } = renderEditor('wysiwyg');
    const mainViewport = container.querySelector('[data-testid="editor-main-viewport"]') as HTMLDivElement;

    expect(mainViewport).not.toHaveClass('max-w-3xl');
    expect(mainViewport).not.toHaveClass('mx-auto');
    expect(screen.getByTestId('editor-content')).not.toHaveClass('max-w-4xl');
    expect(screen.getByTestId('editor-content')).not.toHaveClass('mx-auto');
    expect(screen.getByTestId('editor-content')).toHaveClass('w-full');
  });
});

describe('Editor split scroll sync', () => {
  it('syncs preview scroll based on source scroll progress in split view', () => {
    renderEditor('split');

    const source = screen.getAllByLabelText('Markdown 源码')[0] as HTMLTextAreaElement;
    const preview = screen.getByTestId('editor-preview-viewport') as HTMLDivElement;

    Object.defineProperty(source, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(source, 'clientHeight', { configurable: true, value: 1000 });
    Object.defineProperty(source, 'scrollTop', { configurable: true, value: 500, writable: true });

    Object.defineProperty(preview, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(preview, 'clientHeight', { configurable: true, value: 1000 });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 0, writable: true });

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    fireEvent.scroll(source);

    expect(preview.scrollTop).toBe(1000);
  });

  it('does not sync when source has no scrollable overflow', () => {
    renderEditor('split');

    const source = screen.getAllByLabelText('Markdown 源码')[0] as HTMLTextAreaElement;
    const preview = screen.getByTestId('editor-preview-viewport') as HTMLDivElement;

    Object.defineProperty(source, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(source, 'clientHeight', { configurable: true, value: 1000 });
    Object.defineProperty(source, 'scrollTop', { configurable: true, value: 0, writable: true });

    Object.defineProperty(preview, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(preview, 'clientHeight', { configurable: true, value: 1000 });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 200, writable: true });

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    fireEvent.scroll(source);

    expect(preview.scrollTop).toBe(200);
  });

  it('does not react to preview scrolling', () => {
    renderEditor('split');

    const source = screen.getAllByLabelText('Markdown 源码')[0] as HTMLTextAreaElement;
    const preview = screen.getByTestId('editor-preview-viewport') as HTMLDivElement;

    Object.defineProperty(source, 'scrollTop', { configurable: true, value: 250, writable: true });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, value: 0, writable: true });

    const rafSpy = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: rafSpy,
    });

    fireEvent.scroll(preview);

    expect(rafSpy).not.toHaveBeenCalled();
    expect(source.scrollTop).toBe(250);
  });

  it('does not sync outside split view', () => {
    renderEditor('source');

    const source = screen.getByLabelText('Markdown 源码') as HTMLTextAreaElement;

    const rafSpy = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: rafSpy,
    });

    fireEvent.scroll(source);

    expect(rafSpy).not.toHaveBeenCalled();
  });
});

describe('Editor search highlighting', () => {
  it('registers a non-persistent search plugin instead of mutating document marks', async () => {
    const editor = createEditor();
    editor.state.doc.descendants.mockImplementation((visitor: (node: any, pos: number) => void) => {
      visitor({ isText: true, text: 'hello hello' }, 1);
    });

    renderEditor('wysiwyg', { editor, searchQuery: 'hello', searchVersion: 1 });

    await waitFor(() => {
      expect(editor.registerPlugin).toHaveBeenCalledTimes(1);
    });

    expect(pluginState.lastRegisteredPlugin).toBeTruthy();
    const pluginStateConfig = pluginState.lastRegisteredPlugin.spec.state;
    pluginStateConfig.init({}, editor.state);
    expect(pluginState.decorationCreateCalls).toHaveLength(1);
    expect(editor.view.dispatch).toHaveBeenCalledTimes(1);
    expect(editor.state.tr.setSelection).toHaveBeenCalled();
    expect(editor.state.tr.removeMark).not.toHaveBeenCalled();
    expect(editor.chain).not.toHaveBeenCalled();
    expect(editor.commands.setTextSelection).not.toHaveBeenCalled();
    expect(editor.commands.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('keeps search decorations transaction-safe through plugin state updates', async () => {
    const editor = createEditor();
    editor.state.doc.descendants.mockImplementation((visitor: (node: any, pos: number) => void) => {
      visitor({ isText: true, text: 'hello hello' }, 1);
    });

    renderEditor('wysiwyg', { editor, searchQuery: 'hello', searchVersion: 1 });

    await waitFor(() => {
      expect(editor.registerPlugin).toHaveBeenCalledTimes(1);
    });

    const pluginStateConfig = pluginState.lastRegisteredPlugin?.spec?.state;
    expect(pluginStateConfig?.init).toBeTypeOf('function');
    expect(pluginStateConfig?.apply).toBeTypeOf('function');

    const initialDecorations = pluginStateConfig.init({}, editor.state);
    const mappedDecorations = { mapped: true };
    initialDecorations.map = vi.fn(() => mappedDecorations);

    const mappedResult = pluginStateConfig.apply(
      { docChanged: false, getMeta: vi.fn(() => null), mapping: { id: 'same-doc' } },
      initialDecorations,
      editor.state,
      editor.state
    );
    expect(initialDecorations.map).toHaveBeenCalledWith({ id: 'same-doc' }, editor.state.doc);
    expect(mappedResult).toBe(mappedDecorations);

    const nextDoc = {
      ...editor.state.doc,
      content: { size: 64 },
      nodeSize: 66,
      descendants: vi.fn((visitor: (node: any, pos: number) => void) => {
        visitor({ isText: true, text: 'hello again' }, 1);
      }),
    };

    const recomputedResult = pluginStateConfig.apply(
      { docChanged: true, getMeta: vi.fn(() => null), mapping: { id: 'changed-doc' } },
      initialDecorations,
      editor.state,
      { ...editor.state, doc: nextDoc }
    );

    expect(pluginState.decorationCreateCalls).toHaveLength(2);
    expect(pluginState.decorationCreateCalls[1].doc).toBe(nextDoc);
    expect(recomputedResult).not.toBe(initialDecorations);
  });

  it('clears and recreates the search plugin when the same query is submitted again or emptied', async () => {
    const editor = createEditor();
    editor.state.doc.descendants.mockImplementation((visitor: (node: any, pos: number) => void) => {
      visitor({ isText: true, text: 'hello hello' }, 1);
    });

    const { rerender } = renderEditor('wysiwyg', { editor, searchQuery: 'hello', searchVersion: 1 });

    await waitFor(() => {
      expect(editor.registerPlugin).toHaveBeenCalledTimes(1);
    });

    const firstPluginKey = pluginState.lastRegisteredPlugin?.key;
    expect(firstPluginKey).toBeTruthy();

    rerender(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode="wysiwyg"
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            searchQuery="hello"
            searchVersion={2}
          />
        </AIProvider>
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(editor.unregisterPlugin).toHaveBeenCalledWith(expect.objectContaining({ key: firstPluginKey }));
      expect(editor.registerPlugin).toHaveBeenCalledTimes(2);
    });

    const secondPluginKey = pluginState.lastRegisteredPlugin?.key;
    expect(secondPluginKey).toBeTruthy();

    rerender(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode="wysiwyg"
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            searchQuery=""
            searchVersion={3}
          />
        </AIProvider>
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(editor.unregisterPlugin).toHaveBeenCalledWith(expect.objectContaining({ key: secondPluginKey }));
    });

    expect(editor.registerPlugin).toHaveBeenCalledTimes(2);
    expect(editor.view.dispatch).toHaveBeenCalledTimes(2);
  });

  it('reports the active search match index for header navigation status', async () => {
    const editor = createEditor();
    const onSearchActiveMatchIndex = vi.fn();
    editor.state.doc.descendants.mockImplementation((visitor: (node: any, pos: number) => void) => {
      visitor({ isText: true, text: 'hello hello' }, 1);
    });

    const { rerender } = renderEditor('wysiwyg', {
      editor,
      searchQuery: 'hello',
      searchVersion: 1,
      onSearchActiveMatchIndex,
    });

    await waitFor(() => expect(onSearchActiveMatchIndex).toHaveBeenCalledWith(1));
    editor.state.selection.from = 1;

    rerender(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode="wysiwyg"
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            searchQuery="hello"
            searchVersion={1}
            searchNavigation={{ direction: 'next', token: 1 }}
            onSearchActiveMatchIndex={onSearchActiveMatchIndex}
          />
        </AIProvider>
      </SettingsProvider>
    );

    await waitFor(() => expect(onSearchActiveMatchIndex).toHaveBeenCalledWith(2));
  });
});

describe('Editor outline jumps', () => {
  it('uses the main editor viewport bounds when scrolling to an outline heading in rich editor mode', async () => {
    const editor = createEditor();
    const mainScrollTo = vi.fn();

    editor.view.coordsAtPos.mockReturnValue({ top: -46, bottom: -14, left: 0, right: 0 });
    Object.defineProperty(editor.view.dom, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: -1680,
        left: 0,
        right: 800,
        bottom: -280,
        width: 800,
        height: 1400,
        x: 0,
        y: -1680,
        toJSON: () => ({}),
      })),
    });

    const { container, rerender } = renderEditor('wysiwyg', { editor });

    const mainViewport = container.querySelector('[data-testid="editor-main-viewport"]') as HTMLDivElement;
    expect(mainViewport).not.toBeNull();

    Object.defineProperty(mainViewport, 'scrollTop', {
      configurable: true,
      value: 1303,
      writable: true,
    });
    Object.defineProperty(mainViewport, 'clientHeight', {
      configurable: true,
      value: 1071,
    });
    Object.defineProperty(mainViewport, 'scrollHeight', {
      configurable: true,
      value: 3400,
    });
    Object.defineProperty(mainViewport, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 101,
        left: 0,
        right: 800,
        bottom: 1172,
        width: 800,
        height: 1071,
        x: 0,
        y: 101,
        toJSON: () => ({}),
      })),
    });
    Object.defineProperty(mainViewport, 'scrollTo', {
      configurable: true,
      value: mainScrollTo,
    });

    rerender(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode="wysiwyg"
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            scrollToPos={{ pos: 9, timestamp: 2 }}
          />
        </AIProvider>
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(editor.commands.setTextSelection).toHaveBeenCalledWith(9);
    });

    expect(editor.view.coordsAtPos).toHaveBeenCalledWith(9);
    expect(mainScrollTo).toHaveBeenCalled();
    expect(mainScrollTo.mock.calls[0][0].top).toBeLessThan(1303);
    expect(editor.commands.scrollIntoView).not.toHaveBeenCalled();
  });

  it('uses a valid inline heading anchor before scrolling the active split preview viewport', async () => {
    const editor = createEditor();
    const scrollIntoView = vi.fn();
    const wrongScrollTo = vi.fn();
    const previewScrollTo = vi.fn();

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(editor.view.dom, 'closest', {
      configurable: true,
      value: vi.fn(() => ({
        scrollTop: 25,
        clientHeight: 250,
        scrollTo: wrongScrollTo,
      })),
    });

    const { container, rerender } = renderEditor('split', { editor });

    const previewViewport = container.querySelector('[data-testid="editor-preview-viewport"]') as HTMLDivElement;
    expect(previewViewport).not.toBeNull();

    Object.defineProperty(previewViewport, 'scrollTop', {
      configurable: true,
      value: 120,
      writable: true,
    });
    Object.defineProperty(previewViewport, 'clientHeight', {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(previewViewport, 'scrollTo', {
      configurable: true,
      value: previewScrollTo,
    });

    rerender(
      <SettingsProvider>
        <AIProvider>
          <Editor
            content={'# 标题\n\n内容'}
            setContent={vi.fn()}
            viewMode="split"
            setViewMode={vi.fn()}
            onToggleFullscreen={vi.fn()}
            isFullscreen={false}
            isToolbarVisible={true}
            setIsToolbarVisible={vi.fn()}
            editor={editor}
            scrollToPos={{ pos: 9, timestamp: 2 }}
          />
        </AIProvider>
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(editor.commands.setTextSelection).toHaveBeenCalledWith(9);
    });

    expect(editor.view.coordsAtPos).toHaveBeenCalledWith(9);
    expect(previewScrollTo).toHaveBeenCalled();
    expect(wrongScrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(editor.commands.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('Editor toolbar commands', () => {
  it('keeps view and focus controls in the editor toolbar without an extra editor maximize button', () => {
    const setViewMode = vi.fn();
    const onToggleFullscreen = vi.fn();
    const setIsToolbarVisible = vi.fn();

    renderEditor('wysiwyg', {
      setViewMode,
      onToggleFullscreen,
      setIsToolbarVisible,
    });

    fireEvent.click(screen.getByRole('button', { name: '源码模式' }));
    fireEvent.click(screen.getByRole('button', { name: '分屏预览' }));
    fireEvent.click(screen.getByRole('button', { name: '隐藏编辑工具栏' }));

    expect(screen.getByRole('button', { name: '进入专注模式' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '最大化编辑视图' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '还原编辑视图' })).not.toBeInTheDocument();
    expect(setViewMode).toHaveBeenCalledWith('source');
    expect(setViewMode).toHaveBeenCalledWith('split');
    expect(onToggleFullscreen).not.toHaveBeenCalled();
    expect(setIsToolbarVisible).toHaveBeenCalledWith(false);
  });

  it('shows a top restore control when the editor toolbar is hidden', () => {
    const setIsToolbarVisible = vi.fn();

    renderEditor('wysiwyg', {
      isToolbarVisible: false,
      setIsToolbarVisible,
    });

    const restoreButton = screen.getByRole('button', { name: '显示编辑工具栏' });

    expect(restoreButton).not.toHaveTextContent('工具栏');
    expect(restoreButton.querySelector('.lucide-chevron-down')).not.toBeNull();

    fireEvent.click(restoreButton);

    expect(setIsToolbarVisible).toHaveBeenCalledWith(true);
  });

  it('inserts a horizontal rule from the toolbar', () => {
    const { editor } = renderEditor('wysiwyg');
    const chain = editor.chain();

    const button = screen.getByTitle('\u5206\u5272\u7ebf');
    fireEvent.click(button);

    expect(chain.setHorizontalRule).toHaveBeenCalled();
  });
});

