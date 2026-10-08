import { describe, expect, it } from 'vitest';
import { formatPanguSpacing, normalizeCjkEmphasis } from './pangu';

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

describe('normalizeCjkEmphasis', () => {
  it('inserts space after ** when bold text ends with Chinese punctuation followed by text', () => {
    expect(normalizeCjkEmphasis('给 **DSH（DeepSeek Harness）**装上 dsh-blender')).toBe(
      '给 **DSH（DeepSeek Harness）** 装上 dsh-blender'
    );
    expect(normalizeCjkEmphasis('**13 个工具：**查环境')).toBe('**13 个工具：** 查环境');
    expect(normalizeCjkEmphasis('**能导出：**GLB')).toBe('**能导出：** GLB');
  });

  it('keeps normal bold text and code blocks intact', () => {
    expect(normalizeCjkEmphasis('这篇讲另一种玩法：**你什么都不用开**。装一个插件')).toBe(
      '这篇讲另一种玩法：**你什么都不用开**。装一个插件'
    );
    expect(normalizeCjkEmphasis('`**13 个工具：**查环境`')).toBe('`**13 个工具：**查环境`');
    expect(normalizeCjkEmphasis('```\n**13 个工具：**查环境\n```')).toBe('```\n**13 个工具：**查环境\n```');
  });
});
