import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { MathInline, MathBlock, normalizeLatex } from './mathExtension';
import { createMarkedKatexExtension } from './markedKatex';
import { marked, Marked } from 'marked';
import katex from 'katex';

function createTestEditor(content: string = '') {
  return new Editor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      MathInline,
      MathBlock,
      Markdown,
    ],
    content,
  });
}

describe('MathExtension: Inline Math ($...$)', () => {
  it('parses inline math formula $I_e$ into a mathInline node', () => {
    const editor = createTestEditor('额定电流 $I_e$');

    let foundMath = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        foundMath = true;
        expect(node.attrs.latex).toBe('I_e');
      }
    });

    expect(foundMath).toBe(true);
    const md = (editor.storage as any).markdown.getMarkdown();
    expect(md).toContain('$I_e$');
    editor.destroy();
  });

  it('correctly parses user screenshot table cells containing math formulas', () => {
    const tableMd = `| 参数名称 | 宏 / 结构体字段 | Modbus 寄存器 | 32A 规格默认值 | 16A 规格推荐值 | 单位 / 说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 额定电流 $I_e$ | \`u32Ie\` | \`0x017C\` | \`32000\` | \`16000\` | mA (16.000A) |
| 额定功率 $P_e$ | \`u32Pe\` | \`0x017E\` | \`7040\` | \`3520\` | W ($16\\text{A} \\times 220\\text{V} = 3520\\text{W}$) |
| 过流报警阈值 $OI_1$ | \`u32Oi1\` | \`0x0162\` | \`30000\` | \`15000\` | mA |`;

    const editor = createTestEditor(tableMd);

    const formulas: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        formulas.push(node.attrs.latex);
      }
    });

    console.log('EXTRACTED FORMULAS:', formulas);

    expect(formulas).toContain('I_e');
    expect(formulas).toContain('P_e');
    expect(formulas).toContain('16\\text{A} \\times 220\\text{V} = 3520\\text{W}');
    expect(formulas).toContain('OI_1');

    const outputMd = (editor.storage as any).markdown.getMarkdown();
    console.log('OUTPUT MD:', outputMd);
    expect(outputMd).toContain('$I_e$');
    expect(outputMd).toContain('$P_e$');
    expect(outputMd).toContain('$16\\text{A} \\times 220\\text{V} = 3520\\text{W}$');
    expect(outputMd).toContain('$OI_1$');

    editor.destroy();
  });

  it('does not parse currency as inline math', () => {
    const editor = createTestEditor('The total price is $100 and tax is $20.');

    let hasMath = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        hasMath = true;
      }
    });

    expect(hasMath).toBe(false);
    editor.destroy();
  });

  it('does not parse space-padded dollar signs as math', () => {
    const editor = createTestEditor('Testing $ not math $ here');

    let hasMath = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        hasMath = true;
      }
    });

    expect(hasMath).toBe(false);
    editor.destroy();
  });

  it('normalizes double-escaped LaTeX commands', () => {
    expect(normalizeLatex('80^\\\\circ\\\\text{C}')).toBe('80^\\circ\\text{C}');
    expect(normalizeLatex('16\\\\text{A} \\\\times 220\\\\text{V} = 3520\\\\text{W}')).toBe('16\\text{A} \\times 220\\text{V} = 3520\\text{W}');
  });

  it('parses inline math with escaped backslashes in user markdown table', () => {
    const tableMd = `| 额定功率 $P_e$ | W ($16\\\\text{A} \\\\times 220\\\\text{V} = 3520\\\\text{W}$) |
| 温度 | $80^\\\\circ\\\\text{C}$ |`;

    const editor = createTestEditor(tableMd);

    const formulas: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        formulas.push(node.attrs.latex);
      }
    });

    expect(formulas).toContain('P_e');
    expect(formulas).toContain('16\\text{A} \\times 220\\text{V} = 3520\\text{W}');
    expect(formulas).toContain('80^\\circ\\text{C}');

    editor.destroy();
  });

  it('inserts inline math using the insertMathInline command', () => {
    const editor = createTestEditor('<p>Before</p>');

    editor.commands.insertMathInline({ latex: 'E = mc^2' });

    let foundLatex = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathInline') {
        foundLatex = node.attrs.latex;
      }
    });

    expect(foundLatex).toBe('E = mc^2');
    editor.destroy();
  });
});

describe('MathExtension: Block Math ($$...$$)', () => {
  it('parses multiline display math block into a mathBlock node', () => {
    const mdInput = `# 积分公式

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

说明文字。`;

    const editor = createTestEditor(mdInput);

    let foundBlockMath = false;
    let latexContent = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathBlock') {
        foundBlockMath = true;
        latexContent = node.attrs.latex;
      }
    });

    expect(foundBlockMath).toBe(true);
    expect(latexContent).toContain('\\int_0^\\infty');
    expect(latexContent).toContain('\\frac{\\sqrt{\\pi}}{2}');

    const mdOutput = (editor.storage as any).markdown.getMarkdown();
    expect(mdOutput).toContain('$$\n');
    expect(mdOutput).toContain('\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}');
    expect(mdOutput).toContain('\n$$');

    editor.destroy();
  });

  it('parses single line display math block $$E = mc^2$$', () => {
    const mdInput = '$$E = mc^2$$';
    const editor = createTestEditor(mdInput);

    let foundBlockMath = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathBlock') {
        foundBlockMath = true;
        expect(node.attrs.latex).toBe('E = mc^2');
      }
    });

    expect(foundBlockMath).toBe(true);
    editor.destroy();
  });

  it('inserts math block using the insertMathBlock command', () => {
    const editor = createTestEditor('<p>Header</p>');

    editor.commands.insertMathBlock({ latex: '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}' });

    let foundLatex = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'mathBlock') {
        foundLatex = node.attrs.latex;
      }
    });

    expect(foundLatex).toContain('\\sum_{i=1}^n');
    editor.destroy();
  });
});

describe('KaTeX rendering & Export integration', () => {
  it('renders KaTeX formulas cleanly to string without throwing', () => {
    const htmlInline = katex.renderToString('I_e', { displayMode: false, throwOnError: false });
    expect(htmlInline).toContain('katex');
    expect(htmlInline).toContain('I');

    const htmlDisplay = katex.renderToString('16\\text{A} \\times 220\\text{V} = 3520\\text{W}', {
      displayMode: true,
      throwOnError: false,
    });
    expect(htmlDisplay).toContain('katex-display');
  });

  it('marked extension renders formulas into HTML for export', () => {
    const markedInstance = new Marked();
    markedInstance.use(createMarkedKatexExtension());

    const html = markedInstance.parse('额定电流 $I_e$ 与公式块：\n\n$$\\frac{a}{b} = c$$\n') as string;
    expect(html).toContain('katex');
    expect(html).toContain('katex-display-block');
  });
});
