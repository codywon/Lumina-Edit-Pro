import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsProvider, useSettings } from './SettingsContext';

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

function SettingsProbe() {
  const { settings, updateSettings } = useSettings();

  return (
    <div>
      <pre data-testid="settings-json">{JSON.stringify(settings)}</pre>
      <button type="button" onClick={() => updateSettings({ fontSize: 13 })}>
        Set Font 13
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty('--editor-font-size');
  vi.clearAllMocks();
});

beforeEach(() => {
  ensureMatchMedia();
});

describe('SettingsContext defaults', () => {
  it('no longer exposes a rich-text line number setting', () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>
    );

    expect(screen.getByTestId('settings-json').textContent).not.toContain('showLineNumbers');
  });

  it('updates --editor-font-size on documentElement when fontSize changes', () => {
    render(
      <SettingsProvider>
        <SettingsProbe />
      </SettingsProvider>
    );

    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('16px');

    fireEvent.click(screen.getByText('Set Font 13'));

    expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('13px');
  });
});
