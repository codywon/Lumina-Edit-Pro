import markdownit from 'markdown-it';
import { marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { formatPanguSpacing, normalizeCjkEmphasis } from './pangu';

const markdownItParser = markdownit();

/** True when the markdown renders as real bold in both engines the app ships with. */
function rendersAsBold(source: string): boolean {
  const normalized = normalizeCjkEmphasis(source);
  const html = markdownItParser.render(normalized);
  const markedHtml = marked.parse(normalized, { async: false, gfm: true }) as string;
  return html.includes('<strong>') && !html.includes('**') && markedHtml.includes('<strong>') && !markedHtml.includes('**');
}

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
    expect(normalizeCjkEmphasis('~~~\n**13 个工具：**查环境\n~~~')).toBe('~~~\n**13 个工具：**查环境\n~~~');
    expect(normalizeCjkEmphasis('    **13 个工具：**查环境')).toBe('    **13 个工具：**查环境');
  });

  it('inserts a space before ** when the bold text starts with punctuation', () => {
    // Reported case: the opener hugs a Chinese quotation mark right after a CJK character.
    expect(normalizeCjkEmphasis('我方量身定制了基于微服务架构的**"端-网-云-用"四层高可用总体技术架构**。')).toBe(
      '我方量身定制了基于微服务架构的 **"端-网-云-用"四层高可用总体技术架构**。'
    );
    expect(normalizeCjkEmphasis('这是**“引号”**的内容')).toBe('这是 **“引号”** 的内容');
    expect(normalizeCjkEmphasis('甲**（备注）**。')).toBe('甲 **（备注）**。');
    expect(normalizeCjkEmphasis('甲**「书名」**乙')).toBe('甲 **「书名」** 乙');
    expect(normalizeCjkEmphasis('甲**$x$**乙')).toBe('甲 **$x$** 乙');
  });

  it('strips padding whitespace inside the delimiters', () => {
    expect(normalizeCjkEmphasis('甲** 备注 **乙')).toBe('甲**备注**乙');
    expect(normalizeCjkEmphasis('甲** "端-网-云-用"四层**。')).toBe('甲 **"端-网-云-用"四层**。');
  });

  it('handles punctuation hugging both delimiters', () => {
    expect(normalizeCjkEmphasis('甲**（备注）**乙')).toBe('甲 **（备注）** 乙');
    expect(normalizeCjkEmphasis('甲**`code`**乙')).toBe('甲 **`code`** 乙');
    expect(normalizeCjkEmphasis('甲**\uFFFC**乙')).toBe('甲 **\uFFFC** 乙');
  });

  it('leaves delimiters at line boundaries and literal asterisks alone', () => {
    // Line start / line end already satisfy the flanking rules — nothing to repair.
    expect(normalizeCjkEmphasis('**"端-网-云-用"四层高可用**。')).toBe('**"端-网-云-用"四层高可用**。');
    expect(normalizeCjkEmphasis('甲 **（备注：）**')).toBe('甲 **（备注：）**');
    // Single stars (bullets, italic, bold-italic runs) are never rewritten.
    expect(normalizeCjkEmphasis('* 列表项 **内联加粗**')).toBe('* 列表项 **内联加粗**');
    expect(normalizeCjkEmphasis('***粗细混排***')).toBe('***粗细混排***');
    expect(normalizeCjkEmphasis('甲**备注：**')).toBe('甲**备注：**');
  });

  it('produces real <strong> output in markdown-it and marked for every CJK pattern', () => {
    const samples = [
      '我方量身定制了基于微服务架构的**"端-网-云-用"四层高可用总体技术架构**。',
      '这是**“引号”**的内容。',
      '甲**（备注）**乙',
      '甲**`device_id`**乙',
      '**13 个工具：**查环境',
      '给 **DSH（DeepSeek Harness）**装上 dsh-blender',
      '**能导出：**GLB',
      '甲** 备注 **乙',
    ];

    for (const sample of samples) {
      expect(rendersAsBold(sample), sample).toBe(true);
    }
  });
});
