import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const editorState = vi.hoisted(() => {
  const commands = {
    setContent: vi.fn(),
  };

  return {
    lastUseEditorOptions: null as any,
    lastHeaderProps: null as any,
    lastEditorProps: null as any,
    lastSidebarLeftProps: null as any,
    mockEditor: {
      isFocused: false,
      storage: {
        markdown: {
          getMarkdown: vi.fn(() => ''),
        },
      },
      commands,
      state: {
        doc: {
          descendants: vi.fn(),
        },
      },
    },
  };
});

const nativeState = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => false),
  nativeClient: {
    appHealth: vi.fn(() => Promise.resolve({ appName: 'Lumina Edit Pro', version: 'test', status: 'ok' })),
    setWindowTitle: vi.fn(() => Promise.resolve()),
    minimizeWindow: vi.fn(() => Promise.resolve()),
    toggleMaximizeWindow: vi.fn(() => Promise.resolve()),
    closeWindow: vi.fn(() => Promise.resolve()),
    startWindowDrag: vi.fn(() => Promise.resolve()),
    getCliOpenFile: vi.fn(() => Promise.resolve(null)),
    setAsDefaultEditor: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
    openDefaultAppsSettings: vi.fn(() => Promise.resolve()),
  },
  setNativeWindowTitle: vi.fn(() => Promise.resolve()),
  getNativeCliOpenFile: vi.fn(() => Promise.resolve(null)),
  setNativeAsDefaultEditor: vi.fn(() => Promise.resolve({ success: true, message: 'ok' })),
  openNativeDefaultAppsSettings: vi.fn(() => Promise.resolve()),
}));

vi.mock('framer-motion', () => {
  const createMotionComponent = (tag: keyof React.JSX.IntrinsicElements) =>
    React.forwardRef<HTMLElement, any>(({ children, initial, animate, exit, transition, ...props }, ref) =>
      React.createElement(tag, { ...props, ref }, children)
    );

  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => createMotionComponent(tag as keyof React.JSX.IntrinsicElements),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@tiptap/react', () => ({
  useEditor: (options: any) => {
    editorState.lastUseEditorOptions = options;
    return editorState.mockEditor;
  },
  ReactNodeViewRenderer: () => () => null,
}));

vi.mock('./components/Header', () => ({
  default: (props: any) => {
    editorState.lastHeaderProps = props;
    return null;
  },
}));

vi.mock('./components/SidebarLeft', () => ({
  default: (props: any) => {
    editorState.lastSidebarLeftProps = props;
    return (
      <div>
        {props.headings?.map((heading: any, index: number) => (
          <button
            key={`${heading.id ?? heading.text}-${index}`}
            type="button"
            onClick={() => props.onHeadingClick?.(heading.pos)}
          >
            {heading.text}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('./components/Editor', () => ({
  default: (props: any) => {
    editorState.lastEditorProps = props;
    return null;
  },
}));

vi.mock('./components/SidebarRight', () => ({
  default: () => null,
}));

vi.mock('./components/Footer', () => ({
  default: () => null,
}));

vi.mock('./components/SettingsModal', () => ({
  default: () => null,
}));

vi.mock('./components/AICenterModal', () => ({
  default: () => null,
}));

vi.mock('./components/AboutModal', () => ({
  default: () => null,
}));

vi.mock('./lib/fileSystem', () => ({
  openFile: vi.fn(),
  openDirectory: vi.fn(),
  readFile: vi.fn(),
  readWorkspaceEntries: vi.fn(),
  restoreNativeWorkspace: vi.fn(() => Promise.resolve(null)),
  writeFile: vi.fn(),
}));

vi.mock('./services/native', () => nativeState);

import App from './App';

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json'
);

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

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  editorState.lastUseEditorOptions = null;
  editorState.lastHeaderProps = null;
  editorState.lastEditorProps = null;
  editorState.lastSidebarLeftProps = null;
  editorState.mockEditor.storage.markdown.getMarkdown.mockReturnValue('');
});

beforeEach(() => {
  ensureMatchMedia();
});

describe('App editor shell configuration', () => {
  it('declares @tiptap/extension-link explicitly because App imports it directly', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.dependencies['@tiptap/extension-link']).toBeDefined();
  });

  it('registers the TipTap link and image extensions required by visible insert commands', () => {
    render(<App />);

    const extensionNames = editorState.lastUseEditorOptions.extensions.map((extension: any) => extension.name);

    expect(extensionNames).toContain('link');
    expect(extensionNames).toContain('image');
  });

  it('passes document search from the header into the editor and clears it when submitted empty', async () => {
    render(<App />);

    editorState.lastHeaderProps.onSearch('标题');
    await waitFor(() => expect(editorState.lastEditorProps.searchQuery).toBe('标题'));

    editorState.lastHeaderProps.onSearch('');
    await waitFor(() => expect(editorState.lastEditorProps.searchQuery).toBe(''));
  });

  it('increments the search request token when the same query is submitted repeatedly', async () => {
    render(<App />);

    editorState.lastHeaderProps.onSearch('标题');
    await waitFor(() => expect(editorState.lastEditorProps.searchQuery).toBe('标题'));
    const firstToken = editorState.lastEditorProps.searchVersion;

    editorState.lastHeaderProps.onSearch('标题');

    await waitFor(() => expect(editorState.lastEditorProps.searchVersion).toBeGreaterThan(firstToken));
  });

  it('passes the active search match index from the editor back into the header', async () => {
    render(<App />);

    editorState.lastEditorProps.onSearchActiveMatchIndex(3);

    await waitFor(() => expect(editorState.lastHeaderProps.searchActiveMatchIndex).toBe(3));
  });

  it('passes titlebar window handlers and focus mode toggle into the header without showing a floating focus exit button', async () => {
    render(<App />);

    expect(editorState.lastHeaderProps.onToggleFocusMode).toEqual(expect.any(Function));
    expect(editorState.lastHeaderProps.onWindowMinimize).toEqual(expect.any(Function));
    expect(editorState.lastHeaderProps.onWindowToggleMaximize).toEqual(expect.any(Function));
    expect(editorState.lastHeaderProps.onWindowClose).toEqual(expect.any(Function));
    expect(editorState.lastHeaderProps.onWindowStartDrag).toEqual(expect.any(Function));

    editorState.lastHeaderProps.onToggleFocusMode();

    await waitFor(() => expect(editorState.lastEditorProps).toBeTruthy());
    expect(screen.queryByRole('button', { name: '退出专注模式' })).not.toBeInTheDocument();
  });

  it('keeps a native drag strip available while focus mode hides the normal titlebar', async () => {
    render(<App />);

    editorState.lastHeaderProps.onToggleFocusMode();

    const focusDragStrip = await screen.findByLabelText('专注模式窗口拖拽区');
    expect(focusDragStrip).toHaveAttribute('data-tauri-drag-region');

    fireEvent.pointerDown(focusDragStrip, { button: 0 });

    await waitFor(() => expect(nativeState.nativeClient.startWindowDrag).toHaveBeenCalledTimes(1));
  });

  it('does not force-open the AI assistant when editor fullscreen is restored', async () => {
    render(<App />);

    expect(editorState.lastHeaderProps.aiPanelOpen).toBe(false);

    editorState.lastHeaderProps.onToggleFullscreen();
    await waitFor(() => expect(editorState.lastEditorProps.isFullscreen).toBe(true));
    expect(editorState.lastHeaderProps.aiPanelOpen).toBe(false);

    editorState.lastHeaderProps.onToggleFullscreen();
    await waitFor(() => expect(editorState.lastEditorProps.isFullscreen).toBe(false));
    expect(editorState.lastHeaderProps.aiPanelOpen).toBe(false);
  });

  it('stores a valid text selection anchor for outline headings instead of the raw heading block position', async () => {
    render(<App />);

    editorState.lastUseEditorOptions.onUpdate({
      editor: {
        storage: {
          markdown: {
            getMarkdown: () => '# 标题',
          },
        },
        state: {
          doc: {
            descendants: (visitor: (node: any, pos: number) => void) => {
              visitor(
                {
                  type: { name: 'heading' },
                  attrs: { level: 1 },
                  textContent: '标题',
                  nodeSize: 4,
                  content: { size: 2 },
                },
                5
              );
            },
          },
        },
      },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '标题' })).toBeInTheDocument());
    expect(editorState.lastSidebarLeftProps.headings).toEqual([
      expect.objectContaining({
        text: '标题',
        pos: 6,
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '标题' }));

    await waitFor(() => expect(editorState.lastEditorProps.scrollToPos).toEqual({ pos: 6, timestamp: expect.any(Number) }));
  });
});
