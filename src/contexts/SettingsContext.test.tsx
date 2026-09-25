import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  const { settings } = useSettings();

  return <pre data-testid="settings-json">{JSON.stringify(settings)}</pre>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
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
});
