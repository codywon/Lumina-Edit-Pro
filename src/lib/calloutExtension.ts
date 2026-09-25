import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const calloutPluginKey = new PluginKey<DecorationSet>('callout-blocks');

const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
type CalloutType = (typeof CALLOUT_TYPES)[number];

const CALLOUT_ICONS: Record<CalloutType, string> = {
  note: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  tip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  important: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  caution: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

const CALLOUT_TITLES: Record<CalloutType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

function createCalloutDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'blockquote') {
      const firstChild = node.firstChild;
      if (firstChild && firstChild.type.name === 'paragraph' && firstChild.textContent) {
        const text = firstChild.textContent;
        const match = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*(.*))?$/im);
        if (match) {
          const type = match[1].toLowerCase() as CalloutType;
          const customTitle = match[2]?.trim();
          const displayTitle = customTitle || CALLOUT_TITLES[type];

          // 1. Decorate blockquote with container classes
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              class: `callout-card callout-${type}`,
              'data-callout-type': type,
            })
          );

          // 2. Decorate first paragraph as header
          const pPos = pos + 1;
          decorations.push(
            Decoration.node(pPos, pPos + firstChild.nodeSize, {
              class: `callout-header callout-header-${type}`,
            })
          );

          // 3. Insert icon badge widget at the beginning of the header
          decorations.push(
            Decoration.widget(pPos + 1, () => {
              const badge = document.createElement('span');
              badge.className = `callout-badge callout-badge-${type}`;
              badge.innerHTML = `${CALLOUT_ICONS[type]}<span class="callout-title">${displayTitle}</span>`;
              return badge;
            }, { side: -1 })
          );
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const CalloutExtension = Extension.create({
  name: 'calloutBlocks',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: calloutPluginKey,
        state: {
          init(_, { doc }) {
            return createCalloutDecorations(doc);
          },
          apply(tr, oldSet, _, newState) {
            if (!tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }
            return createCalloutDecorations(newState.doc);
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
