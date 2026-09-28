import { Node, InputRule, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MathInlineView from '../components/MathInlineView';
import MathBlockView from '../components/MathBlockView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /**
       * Insert an inline math formula ($...$)
       */
      insertMathInline: (attrs?: { latex?: string }) => ReturnType;
    };
    mathBlock: {
      /**
       * Insert a display math block ($$...$$)
       */
      insertMathBlock: (attrs?: { latex?: string }) => ReturnType;
    };
  }
}

/**
 * Inline math parsing rule for markdown-it
 */
function mathInlineRule(state: any, silent: boolean) {
  const start = state.pos;
  const max = state.posMax;
  const src = state.src;

  if (src.charCodeAt(start) !== 0x24 /* $ */) {
    return false;
  }

  // Escaped \$
  if (start > 0 && src.charCodeAt(start - 1) === 0x5C /* \ */) {
    return false;
  }

  // Check if double dollar $$
  let isDouble = false;
  if (start + 1 < max && src.charCodeAt(start + 1) === 0x24) {
    isDouble = true;
  }

  const delimLength = isDouble ? 2 : 1;
  const contentStart = start + delimLength;

  if (contentStart >= max) return false;

  // Disallow whitespace immediately after opening delimiter
  const firstChar = src.charCodeAt(contentStart);
  if (firstChar === 0x20 || firstChar === 0x09 || firstChar === 0x0A || firstChar === 0x0D) {
    return false;
  }

  let matchEnd = -1;
  let pos = contentStart;

  while (pos < max) {
    if (src.charCodeAt(pos) === 0x5C /* \ */) {
      pos += 2; // Skip escaped character like \$ or \|
      continue;
    }

    if (src.charCodeAt(pos) === 0x24 /* $ */) {
      if (isDouble) {
        if (pos + 1 < max && src.charCodeAt(pos + 1) === 0x24) {
          const prevChar = src.charCodeAt(pos - 1);
          if (prevChar !== 0x20 && prevChar !== 0x09 && prevChar !== 0x0A && prevChar !== 0x0D) {
            matchEnd = pos;
            break;
          }
        }
      } else {
        const prevChar = src.charCodeAt(pos - 1);
        if (prevChar !== 0x20 && prevChar !== 0x09 && prevChar !== 0x0A && prevChar !== 0x0D) {
          // Closing $ must not be followed immediately by a digit (avoid currency like $20 and $30)
          if (pos + 1 < max && src.charCodeAt(pos + 1) >= 0x30 && src.charCodeAt(pos + 1) <= 0x39) {
            pos++;
            continue;
          }
          matchEnd = pos;
          break;
        }
      }
    }
    pos++;
  }

  if (matchEnd === -1) {
    return false;
  }

  if (!silent) {
    const content = src.slice(contentStart, matchEnd);
    const token = state.push('math_inline', 'span', 0);
    token.content = content;
    token.markup = isDouble ? '$$' : '$';
  }

  state.pos = matchEnd + delimLength;
  return true;
}

/**
 * Block math parsing rule for markdown-it ($$\n...\n$$ or $$...$$)
 */
function mathBlockRule(state: any, startLine: number, endLine: number, silent: boolean) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  if (pos + 2 > max) return false;
  if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) return false;

  pos += 2;
  let firstLine = state.src.slice(pos, max);

  if (silent) return true;

  let haveEndMarker = false;
  const trimmed = firstLine.trim();
  if (trimmed.endsWith('$$') && trimmed.length >= 2) {
    firstLine = trimmed.slice(0, -2);
    haveEndMarker = true;
  }

  let nextLine = startLine;
  const lines: string[] = [];

  if (haveEndMarker) {
    lines.push(firstLine);
  } else {
    if (firstLine.trim().length > 0) {
      lines.push(firstLine);
    }
    for (;;) {
      nextLine++;
      if (nextLine >= endLine) break;

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos < max && state.tShift[nextLine] < state.blkIndent) break;

      const lineText = state.src.slice(pos, max).trim();
      if (lineText.endsWith('$$')) {
        const withoutEnd = lineText.slice(0, -2).trim();
        if (withoutEnd.length > 0) {
          lines.push(withoutEnd);
        }
        haveEndMarker = true;
        break;
      }
      lines.push(state.src.slice(pos, max));
    }
  }

  state.line = nextLine + 1;

  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = lines.join('\n');
  token.map = [startLine, state.line];
  token.markup = '$$';

  return true;
}

/**
 * MathInline Node: Inline math ($...$)
 */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) => {
          return (
            element.getAttribute('data-latex') ||
            element.getAttribute('data-katex') ||
            element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ||
            element.textContent?.replace(/^\$|\$$/g, '').trim() ||
            ''
          );
        },
        renderHTML: (attributes: Record<string, any>) => ({
          'data-latex': attributes.latex || '',
          class: 'math-inline',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-latex]',
      },
      {
        tag: 'span.math-inline',
      },
      {
        tag: 'span.katex',
        getAttrs: (element: HTMLElement) => {
          const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
          if (annotation?.textContent) {
            return { latex: annotation.textContent.trim() };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'math-inline' }),
      `$${HTMLAttributes['data-latex'] || ''}$`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addCommands() {
    return {
      insertMathInline:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: attrs?.latex ?? 'x' },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-m': () => this.editor.commands.insertMathInline(),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)\$([^$\n\r]+?)\$$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const latex = match[1]?.trim();
          if (!latex) return;

          const start = range.from + (match[0].startsWith(' ') ? 1 : 0);
          tr.replaceWith(start, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$${node.attrs.latex || ''}$`);
        },
        parse: {
          setup(md: any) {
            if (md.__hasMathInline) return;
            md.__hasMathInline = true;
            md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
            md.renderer.rules.math_inline = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<span class="math-inline" data-latex="${md.utils.escapeHtml(token.content)}"></span>`;
            };
          },
        },
      },
    };
  },
});

/**
 * MathBlock Node: Block display math ($$\n...\n$$)
 */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) => {
          return (
            element.getAttribute('data-latex') ||
            element.getAttribute('data-katex') ||
            element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ||
            element.textContent?.replace(/^\$\$|\$\$$/g, '').trim() ||
            ''
          );
        },
        renderHTML: (attributes: Record<string, any>) => ({
          'data-latex': attributes.latex || '',
          class: 'math-block',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-latex]',
      },
      {
        tag: 'div.math-block',
      },
      {
        tag: 'span.katex-display',
        getAttrs: (element: HTMLElement) => {
          const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
          if (annotation?.textContent) {
            return { latex: annotation.textContent.trim() };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'math-block' }),
      `$$\n${HTMLAttributes['data-latex'] || ''}\n$$`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: attrs?.latex ?? '' },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-m': () => this.editor.commands.insertMathBlock(),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$(.+)\$\$$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const latex = match[1]?.trim() || '';
          tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      }),
      new InputRule({
        find: /^\$\$$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create({ latex: '' }));
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$$\n${(node.attrs.latex || '').trim()}\n$$\n\n`);
          state.closeBlock(node);
        },
        parse: {
          setup(md: any) {
            if (md.__hasMathBlock) return;
            md.__hasMathBlock = true;
            md.block.ruler.before('fence', 'math_block', mathBlockRule);
            md.renderer.rules.math_block = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<div class="math-block" data-latex="${md.utils.escapeHtml(token.content)}"></div>\n`;
            };
          },
        },
      },
    };
  },
});
