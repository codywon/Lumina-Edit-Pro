import katex from 'katex';
import type { MarkedExtension } from 'marked';
import { normalizeLatex } from './mathExtension';

/**
 * Marked extension to render LaTeX math formulas using KaTeX ($...$ and $$...$$)
 */
export function createMarkedKatexExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src: string) {
          return src.indexOf('$$');
        },
        tokenizer(src: string) {
          const match =
            /^\$\$[\r\n]+([\s\S]+?)[\r\n]+\$\$ *(?:\n|$)/.exec(src) ||
            /^\$\$([^\r\n]+?)\$\$ *(?:\n|$)/.exec(src);
          if (match) {
            return {
              type: 'mathBlock',
              raw: match[0],
              text: match[1].trim(),
            };
          }
        },
        renderer(token: any) {
          try {
            const normalized = normalizeLatex(token.text);
            return `<div class="katex-display-block py-2 text-center overflow-x-auto">${katex.renderToString(normalized, {
              displayMode: true,
              throwOnError: false,
            })}</div>\n`;
          } catch {
            return `<div class="katex-display-block py-2 text-center text-rose-500 font-mono text-xs">[LaTeX: ${token.text}]</div>\n`;
          }
        },
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src: string) {
          return src.indexOf('$');
        },
        tokenizer(src: string) {
          // Disallow whitespace after open delimiter and before close delimiter
          const match = /^\$([^\s$](?:[^$\n\r]*?[^\s$])?)\$/.exec(src);
          if (match) {
            return {
              type: 'mathInline',
              raw: match[0],
              text: match[1].trim(),
            };
          }
        },
        renderer(token: any) {
          try {
            const normalized = normalizeLatex(token.text);
            return katex.renderToString(normalized, {
              displayMode: false,
              throwOnError: false,
            });
          } catch {
            return `<span class="katex-error text-rose-500 font-mono text-xs">[公式: ${token.text}]</span>`;
          }
        },
      },
    ],
  };
}
