import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexCssPath = resolve(process.cwd(), 'src/index.css');

describe('index.css search highlight styling', () => {
  it('defines visible styling for non-persistent editor search highlights', () => {
    const css = readFileSync(indexCssPath, 'utf8');

    expect(css).toContain('.editor-search-highlight');
    expect(css).toMatch(/\.editor-search-highlight\s*\{[\s\S]*background(?:-color)?:/);
    expect(css).toMatch(/\.editor-search-highlight\s*\{[\s\S]*(border-radius|box-shadow):/);
  });
});

describe('index.css app viewport locking', () => {
  it('locks the document viewport so only app panels scroll internally', () => {
    const css = readFileSync(indexCssPath, 'utf8');

    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*height:\s*100%/);
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*overflow:\s*hidden/);
    expect(css).toMatch(/html,\s*body,\s*#root\s*\{[\s\S]*overscroll-behavior:\s*none/);
  });
});
