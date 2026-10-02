import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCandidateAbsolutePaths,
  resolveImageSrc,
  setActiveDocumentPathInfo,
} from './imageResolver';

describe('Image Resolver', () => {
  beforeEach(() => {
    setActiveDocumentPathInfo({
      workspaceRoot: 'D:/myscript/worktrees',
      documentDir: 'D:/myscript/worktrees/docs/design',
    });
  });

  it('keeps data URLs, blob URLs, and remote web URLs unchanged', () => {
    expect(resolveImageSrc('data:image/png;base64,xxxx')).toBe('data:image/png;base64,xxxx');
    expect(resolveImageSrc('blob:http://localhost/123')).toBe('blob:http://localhost/123');
    expect(resolveImageSrc('https://example.com/img.png')).toBe('https://example.com/img.png');
    expect(resolveImageSrc('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
  });

  it('computes candidate absolute paths for relative asset paths', () => {
    const candidates = getCandidateAbsolutePaths('./.assets/img-123.png');
    expect(candidates).toEqual([
      'D:/myscript/worktrees/docs/design/.assets/img-123.png',
      'D:/myscript/worktrees/.assets/img-123.png',
    ]);
  });

  it('handles absolute file paths directly', () => {
    const candidates = getCandidateAbsolutePaths('D:\\photos\\test.png');
    expect(candidates).toEqual(['D:/photos/test.png']);
  });
});
