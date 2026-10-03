export type ShortcutAction =
  | 'newFile'
  | 'openFile'
  | 'saveFile'
  | 'saveAs'
  | 'openPreferences'
  | 'toggleSidebar'
  | 'toggleSourceMode'
  | 'toggleFullscreen'
  | 'toggleToolbar'
  | 'toggleFocusMode'
  | 'toggleTypewriterMode'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'paragraph'
  | 'table'
  | 'codeBlock'
  | 'blockquote'
  | 'orderedList'
  | 'unorderedList'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'link'
  | 'image';

export interface ShortcutItem {
  id: ShortcutAction;
  label: string;
  defaultShortcut: string;
}

export interface ShortcutGroup {
  id: string;
  label: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'file',
    label: '文件',
    items: [
      { id: 'newFile', label: '新建文件', defaultShortcut: 'Ctrl+N' },
      { id: 'openFile', label: '打开文件', defaultShortcut: 'Ctrl+O' },
      { id: 'saveFile', label: '保存', defaultShortcut: 'Ctrl+S' },
      { id: 'saveAs', label: '另存为', defaultShortcut: 'Ctrl+Shift+S' },
      { id: 'openPreferences', label: '偏好设置', defaultShortcut: 'Ctrl+,' },
    ],
  },
  {
    id: 'paragraph',
    label: '段落',
    items: [
      { id: 'heading1', label: '一级标题', defaultShortcut: 'Ctrl+1' },
      { id: 'heading2', label: '二级标题', defaultShortcut: 'Ctrl+2' },
      { id: 'heading3', label: '三级标题', defaultShortcut: 'Ctrl+3' },
      { id: 'heading4', label: '四级标题', defaultShortcut: 'Ctrl+4' },
      { id: 'heading5', label: '五级标题', defaultShortcut: 'Ctrl+5' },
      { id: 'heading6', label: '六级标题', defaultShortcut: 'Ctrl+6' },
      { id: 'paragraph', label: '普通段落', defaultShortcut: 'Ctrl+0' },
      { id: 'table', label: '插入表格', defaultShortcut: 'Ctrl+T' },
      { id: 'codeBlock', label: '代码块', defaultShortcut: 'Ctrl+Shift+K' },
      { id: 'blockquote', label: '引用', defaultShortcut: 'Ctrl+Shift+Q' },
      { id: 'orderedList', label: '有序列表', defaultShortcut: 'Ctrl+Shift+[' },
      { id: 'unorderedList', label: '无序列表', defaultShortcut: 'Ctrl+Shift+]' },
    ],
  },
  {
    id: 'format',
    label: '格式',
    items: [
      { id: 'bold', label: '加粗', defaultShortcut: 'Ctrl+B' },
      { id: 'italic', label: '斜体', defaultShortcut: 'Ctrl+I' },
      { id: 'strike', label: '删除线', defaultShortcut: 'Alt+Shift+5' },
      { id: 'inlineCode', label: '行内代码', defaultShortcut: 'Ctrl+Shift+`' },
      { id: 'link', label: '链接', defaultShortcut: 'Ctrl+K' },
      { id: 'image', label: '图片', defaultShortcut: 'Ctrl+Shift+I' },
    ],
  },
  {
    id: 'view',
    label: '视图',
    items: [
      { id: 'toggleSidebar', label: '切换侧边栏', defaultShortcut: 'Ctrl+Shift+L' },
      { id: 'toggleSourceMode', label: '源码模式', defaultShortcut: 'Ctrl+/' },
      { id: 'toggleFocusMode', label: '专注模式', defaultShortcut: 'F8' },
      { id: 'toggleTypewriterMode', label: '打字机模式', defaultShortcut: 'F9' },
      { id: 'toggleToolbar', label: '显示/隐藏工具栏', defaultShortcut: 'Ctrl+Shift+T' },
      { id: 'toggleFullscreen', label: '全屏', defaultShortcut: 'F11' },
    ],
  },
];

export const DEFAULT_SHORTCUTS = SHORTCUT_GROUPS.reduce((acc, group) => {
  group.items.forEach((item) => {
    acc[item.id] = item.defaultShortcut;
  });
  return acc;
}, {} as Record<ShortcutAction, string>);

const SHIFTED_DIGITS: Record<string, string> = {
  '0': ')',
  '1': '!',
  '2': '@',
  '3': '#',
  '4': '$',
  '5': '%',
  '6': '^',
  '7': '&',
  '8': '*',
  '9': '(',
};

const SHIFTED_SYMBOLS: Record<string, string> = {
  '[': '{',
  ']': '}',
  '`': '~',
  '-': '_',
  '=': '+',
  '\\': '|',
};

const CODE_KEY_MAP: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '\\': 'Backslash',
};

const normalizeKeyToken = (token: string) => {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'esc') return 'escape';
  if (lower === 'escape') return 'escape';
  if (lower === 'space') return ' ';
  return lower;
};

const normalizeEventKey = (key: string) => {
  if (key === 'Esc') return 'escape';
  if (key === ' ') return ' ';
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
};

export function matchShortcut(event: KeyboardEvent, shortcut: string) {
  if (!shortcut) return false;

  const parts = shortcut.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;

  const mods = { ctrl: false, alt: false, shift: false, meta: false };
  let keyToken = '';

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      mods.ctrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      mods.alt = true;
    } else if (lower === 'shift') {
      mods.shift = true;
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      mods.meta = true;
    } else {
      keyToken = part;
    }
  });

  if (!keyToken) return false;

  if (event.ctrlKey !== mods.ctrl) return false;
  if (event.altKey !== mods.alt) return false;
  if (event.shiftKey !== mods.shift) return false;
  if (event.metaKey !== mods.meta) return false;

  const normalizedToken = normalizeKeyToken(keyToken);
  const normalizedEvent = normalizeEventKey(event.key);

  if (CODE_KEY_MAP[normalizedToken] && event.code === CODE_KEY_MAP[normalizedToken]) {
    return true;
  }

  if (normalizedToken.length === 1) {
    if (normalizedEvent === normalizedToken) return true;
    if (SHIFTED_DIGITS[normalizedToken] && normalizedEvent === SHIFTED_DIGITS[normalizedToken]) return true;
    if (SHIFTED_SYMBOLS[normalizedToken] && normalizedEvent === SHIFTED_SYMBOLS[normalizedToken]) return true;
  }

  return normalizedEvent === normalizedToken;
}
