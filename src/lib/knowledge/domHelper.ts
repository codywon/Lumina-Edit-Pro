/**
 * Safe HTML DOM Parser for both browser/Tauri and Node/testing environments
 */
export function parseHtmlToDocument(html: string): Document {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  // Node.js / test fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = typeof require !== 'undefined' ? require : (module as any).require;
    const { JSDOM } = req('jsdom');
    const dom = new JSDOM(html);
    return dom.window.document;
  } catch {
    // Dynamic import fallback or global JSDOM
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsdom = (globalThis as any).JSDOM;
      if (jsdom) {
        return new jsdom(html).window.document;
      }
    } catch {}
    throw new Error('No DOM parser available in current environment');
  }
}
