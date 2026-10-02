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
    const req = typeof require !== 'undefined' ? require : (eval('require') as NodeRequire);
    const { JSDOM } = req('jsdom');
    const dom = new JSDOM(html);
    return dom.window.document;
  } catch {
    // ESM fallback
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRequire } = eval('require("module")');
      const customReq = createRequire(import.meta.url);
      const { JSDOM } = customReq('jsdom');
      const dom = new JSDOM(html);
      return dom.window.document;
    } catch {
      throw new Error('No DOM parser available in current environment');
    }
  }
}
