import React, { createContext, useContext, useEffect, useState } from 'react';
import { THEME_COLORS, type ThemeColor } from '../lib/themeColors';
import { DEFAULT_SHORTCUTS, type ShortcutAction } from '../lib/shortcuts';

interface Settings {
  // Appearance
  uiFont: string;
  uiDensity: 'compact' | 'comfortable';
  themeColor: ThemeColor;
  customThemeColor: string;

  // Editor
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paragraphSpacing: number;
  typewriterMode: boolean;
  focusMode: boolean;

  // Files
  autoSave: boolean;
  autoSaveInterval: number;
  defaultFormat: 'md' | 'html';
  imageStorageMode: 'filename-assets' | 'shared-assets' | 'custom';
  imageStoragePath: string;

  // Features
  enableAI: boolean;
  spellCheck: boolean;

  // Shortcuts
  shortcuts: Record<ShortcutAction, string>;
}

const defaultSettings: Settings = {
  uiFont: 'Inter',
  uiDensity: 'comfortable',
  themeColor: 'orange',
  customThemeColor: '#ec5b13',
  fontSize: 16,
  fontFamily: 'Inter',
  lineHeight: 1.75,
  paragraphSpacing: 0.5,
  typewriterMode: false,
  focusMode: false,
  autoSave: false,
  autoSaveInterval: 3,
  defaultFormat: 'md',
  imageStorageMode: 'filename-assets',
  imageStoragePath: '${filename}.assets',
  enableAI: true,
  spellCheck: true,
  shortcuts: DEFAULT_SHORTCUTS,
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return `#${hex.toLowerCase()}`;
}

function hexToRgbString(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }
  const raw = normalized.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function darkenHex(hex: string, factor = 0.85) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }
  const raw = normalized.slice(1);
  const r = Math.max(0, Math.round(parseInt(raw.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(raw.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(raw.slice(4, 6), 16) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('app-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { showLineNumbers: _showLineNumbers, ...supportedSettings } = parsed as Settings & {
          showLineNumbers?: boolean;
        };

        const savedShortcuts = (supportedSettings as Partial<Settings>).shortcuts;
        const mergedShortcuts = { ...DEFAULT_SHORTCUTS, ...(savedShortcuts ?? {}) };
        return { ...defaultSettings, ...supportedSettings, shortcuts: mergedShortcuts };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('app-settings', JSON.stringify(settings));
    
    // Apply some settings globally via CSS variables or classes
    const root = document.documentElement;
    root.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--editor-line-height', `${settings.lineHeight || 1.75}`);
    root.style.setProperty('--editor-paragraph-spacing', `${settings.paragraphSpacing || 0.5}em`);

    const fontStackMap: Record<string, string> = {
      'Inter': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
      'JetBrains Mono': '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'Noto Serif SC': '"Noto Serif SC", Georgia, "Source Han Serif SC", SimSun, serif',
      'Georgia': 'Georgia, "Noto Serif SC", "Times New Roman", SimSun, serif',
    };
    const resolvedFont = fontStackMap[settings.fontFamily] || `${settings.fontFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif`;
    root.style.setProperty('--editor-font-family', resolvedFont);
    let accentHex = THEME_COLORS.orange.hex;
    let accentRgb = THEME_COLORS.orange.rgb;
    let accentStrong = THEME_COLORS.orange.strong;

    if (settings.themeColor === 'custom') {
      const customHex = normalizeHexColor(settings.customThemeColor) ?? THEME_COLORS.orange.hex;
      const customRgb = hexToRgbString(customHex) ?? THEME_COLORS.orange.rgb;
      const customStrong = darkenHex(customHex) ?? THEME_COLORS.orange.strong;

      accentHex = customHex;
      accentRgb = customRgb;
      accentStrong = customStrong;
    } else {
      const themeColor = THEME_COLORS[settings.themeColor] ?? THEME_COLORS.orange;
      accentHex = themeColor.hex;
      accentRgb = themeColor.rgb;
      accentStrong = themeColor.strong;
    }

    root.style.setProperty('--accent', accentHex);
    root.style.setProperty('--accent-rgb', accentRgb);
    root.style.setProperty('--accent-strong', accentStrong);
    
    if (settings.uiDensity === 'compact') {
      root.classList.add('density-compact');
    } else {
      root.classList.remove('density-compact');
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
