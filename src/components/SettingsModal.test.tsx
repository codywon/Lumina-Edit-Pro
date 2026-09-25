import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsModal from './SettingsModal';
import { ThemeProvider } from '../contexts/ThemeContext';
import { SettingsProvider } from '../contexts/SettingsContext';

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

function renderSettingsModal() {
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={vi.fn()} />
      </SettingsProvider>
    </ThemeProvider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  ensureMatchMedia();
});

describe('SettingsModal editor presentation options', () => {
  it('does not expose the removed line-number toggle in editor settings', () => {
    renderSettingsModal();

    fireEvent.click(screen.getByRole('button', { name: '\u7f16\u8f91\u5668' }));

    expect(screen.queryByText('\u663e\u793a\u884c\u53f7')).not.toBeInTheDocument();
    expect(screen.getByText('\u6253\u5b57\u673a\u6a21\u5f0f')).toBeInTheDocument();
    expect(screen.getByText('\u4e13\u6ce8\u6a21\u5f0f')).toBeInTheDocument();
  });
});
