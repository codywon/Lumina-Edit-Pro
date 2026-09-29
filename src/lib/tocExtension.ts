import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const tocPluginKey = new PluginKey<DecorationSet>('toc-blocks');

interface TocHeading {
  level: number;
  text: string;
  pos: number;
}

function collectHeadings(doc: any): TocHeading[] {
  const headings: TocHeading[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'heading') {
      headings.push({
        level: node.attrs.level || 1,
        text: node.textContent || '',
        pos: pos + 1,
      });
    }
  });
  return headings;
}

function createTocWidget(headings: TocHeading[], view: any): HTMLElement {
  const container = document.createElement('div');
  container.className = 'toc-card print-hide select-none my-4 p-4 rounded-xl border border-slate-200 dark:border-[#27272A] bg-slate-50/70 dark:bg-[#18181B]/70 shadow-sm transition-all';

  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-[#27272A]';

  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100';
  titleRow.innerHTML = `
    <span class="text-accent text-sm">📑</span>
    <span>目录 (Table of Contents)</span>
  `;

  const countBadge = document.createElement('span');
  countBadge.className = 'text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-200/70 dark:bg-[#27272A] text-slate-600 dark:text-slate-300';
  countBadge.textContent = `${headings.length} 处章节`;

  header.appendChild(titleRow);
  header.appendChild(countBadge);
  container.appendChild(header);

  if (headings.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.className = 'text-xs text-slate-400 dark:text-slate-500 py-1.5 italic';
    emptyNotice.textContent = '当前文档暂无标题，创建 H1 ~ H6 标题后将自动在此生成层级目录。';
    container.appendChild(emptyNotice);
    return container;
  }

  // Headings List
  const list = document.createElement('div');
  list.className = 'space-y-1 max-h-[360px] overflow-y-auto pr-1';

  headings.forEach((h, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'w-full text-left flex items-center gap-2 py-1 px-2 rounded-lg text-xs transition-colors hover:bg-slate-200/60 dark:hover:bg-[#27272A] group';

    // Indentation based on heading level (H1 = 0, H2 = 12px, H3 = 24px...)
    const indentPx = Math.max(0, (h.level - 1) * 16);
    item.style.paddingLeft = `${Math.min(indentPx + 8, 80)}px`;

    const levelIndicator = document.createElement('span');
    levelIndicator.className = 'text-[10px] font-mono text-slate-400 dark:text-slate-500 group-hover:text-accent shrink-0';
    levelIndicator.textContent = `H${h.level}`;

    const textSpan = document.createElement('span');
    textSpan.className = 'truncate text-slate-700 dark:text-slate-300 group-hover:text-accent font-medium';
    textSpan.textContent = h.text || `(未命名章节 ${idx + 1})`;

    item.appendChild(levelIndicator);
    item.appendChild(textSpan);

    // Jump to heading on click
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const coords = view.coordsAtPos(h.pos);
        const editorScrollable = view.dom.closest('.overflow-y-auto') || window;
        if (editorScrollable && typeof editorScrollable.scrollTo === 'function') {
          const rect = view.dom.getBoundingClientRect();
          const targetTop = coords.top - rect.top;
          editorScrollable.scrollTo({
            top: Math.max(0, targetTop - 80),
            behavior: 'smooth',
          });
        }
      } catch {
        // Fallback
      }
    });

    list.appendChild(item);
  });

  container.appendChild(list);
  return container;
}

function createTocDecorations(doc: any, view?: any): DecorationSet {
  const decorations: Decoration[] = [];
  const headings = collectHeadings(doc);

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'paragraph') {
      const text = (node.textContent || '').trim();
      if (/^\[(TOC|toc)\]$/i.test(text)) {
        // Decorate node to hide raw text while editing
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'toc-marker-node',
          })
        );

        // Widget for visual interactive TOC
        decorations.push(
          Decoration.widget(
            pos + 1,
            () => {
              return createTocWidget(headings, view);
            },
            { side: 1, stopEvent: () => false }
          )
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

function checkDocHasTocMarker(doc: any): boolean {
  let has = false;
  doc.descendants((node: any) => {
    if (node.type.name === 'paragraph') {
      const text = (node.textContent || '').trim();
      if (/^\[(TOC|toc)\]$/i.test(text)) {
        has = true;
        return false;
      }
    }
  });
  return has;
}

function checkTransactionTouchesHeadingsOrToc(tr: any, state: any): boolean {
  let touched = false;
  tr.steps.forEach((step: any) => {
    if (step.from !== undefined && step.to !== undefined) {
      const safePos = Math.min(step.from, state.doc.content.size);
      const $pos = state.doc.resolve(safePos);
      for (let d = $pos.depth; d > 0; d--) {
        const typeName = $pos.node(d).type.name;
        if (typeName === 'heading' || typeName === 'paragraph') {
          // If it's a heading or could be editing [TOC]
          touched = true;
          return;
        }
      }
    }
  });
  return touched;
}

export const TocExtension = Extension.create({
  name: 'tocExtension',

  addProseMirrorPlugins() {
    let editorView: any = null;

    return [
      new Plugin({
        key: tocPluginKey,
        view(v) {
          editorView = v;
          return {};
        },
        state: {
          init(_, { doc }) {
            if (!checkDocHasTocMarker(doc)) {
              return DecorationSet.empty;
            }
            return createTocDecorations(doc);
          },
          apply(tr, oldSet, oldState, newState) {
            if (!tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }

            // High performance fast path: if document has no [TOC] marker, bypass full document scan in O(1)
            const oldHas = checkDocHasTocMarker(oldState.doc);
            const newHas = checkDocHasTocMarker(newState.doc);
            if (!oldHas && !newHas) {
              return DecorationSet.empty;
            }

            return createTocDecorations(newState.doc, editorView);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
