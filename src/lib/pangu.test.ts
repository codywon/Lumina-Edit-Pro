import { describe, expect, it } from 'vitest';
import { formatPanguSpacing } from './pangu';

describe('formatPanguSpacing', () => {
  it('inserts space between Chinese and English words', () => {
    expect(formatPanguSpacing('用Python编写Markdown')).toBe('用 Python 编写 Markdown');
  });

  it('inserts space between Chinese and Numbers', () => {
    expect(formatPanguSpacing('价格是100元')).toBe('价格是 100 元');
  });

  it('keeps existing spaces intact', () => {
    expect(formatPanguSpacing('已有 空格 的情况')).toBe('已有 空格 的情况');
  });

  it('handles empty strings gracefully', () => {
    expect(formatPanguSpacing('')).toBe('');
  });
});
