import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import { convertHtmlToMarkdown } from '../htmlToMarkdown';
import type { ExtractedArticle, KnowledgeAdapter, KnowledgeMetadata } from '../types';

export class XiaohongshuAdapter implements KnowledgeAdapter {
  platform = 'xiaohongshu' as const;

  canHandle(url: string): boolean {
    return /xiaohongshu\.com|xhslink\.com/i.test(url);
  }

  async extract(url: string, rawHtml?: string): Promise<ExtractedArticle> {
    let finalUrl = url;
    let html = rawHtml;

    if (!html) {
      const res = await networkFetchText({
        url,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      html = res.content;
      finalUrl = res.finalUrl || url;
    }

    // Try extracting from window.__INITIAL_STATE__
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*;?\s*<\/script>/s);
    if (stateMatch) {
      try {
        const rawJson = stateMatch[1].replace(/undefined/g, 'null');
        const state = JSON.parse(rawJson);
        const noteDetail = this.findNoteDetailInState(state);
        if (noteDetail) {
          return this.buildArticleFromNote(noteDetail, finalUrl);
        }
      } catch (err) {
        console.warn('[XiaohongshuAdapter] Failed to parse __INITIAL_STATE__, falling back to DOM parsing', err);
      }
    }

    // Fallback: parse DOM
    return this.extractFromDom(html, finalUrl);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findNoteDetailInState(state: any): any {
    if (!state) return null;

    if (state.note?.noteDetailMap) {
      const keys = Object.keys(state.note.noteDetailMap);
      if (keys.length > 0) {
        return state.note.noteDetailMap[keys[0]]?.note || state.note.noteDetailMap[keys[0]];
      }
    }

    if (state.note?.note) return state.note.note;
    if (state.noteData) return state.noteData;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildArticleFromNote(note: any, sourceUrl: string): ExtractedArticle {
    const title = note.title || '小红书笔记';
    const author = note.user?.nickname || note.user?.name || '';
    const desc = note.desc || '';
    const tags: string[] = [];

    if (Array.isArray(note.tagList)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      note.tagList.forEach((t: any) => {
        if (t?.name) tags.push(t.name);
      });
    }

    // Extract high-res image list
    const images: string[] = [];
    if (Array.isArray(note.imageList)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      note.imageList.forEach((img: any) => {
        const url = img?.urlDefault || img?.url || img?.infoList?.[0]?.url;
        if (url) {
          // Normalize to https and strip thumbnail crop parameters if needed
          const cleanUrl = url.startsWith('//') ? `https:${url}` : url;
          images.push(cleanUrl);
        }
      });
    }

    let markdown = `# ${title}\n\n`;

    if (author) {
      markdown += `> **作者**：${author}\n\n`;
    }

    if (desc) {
      markdown += `${desc.trim()}\n\n`;
    }

    if (images.length > 0) {
      markdown += `### 笔记贴图 / 画廊 (${images.length} 张)\n\n`;
      images.forEach((imgUrl, idx) => {
        markdown += `![图片 ${idx + 1}](${imgUrl})\n\n`;
      });
    }

    if (tags.length > 0) {
      markdown += `\n**标签**：${tags.map((t) => `#${t}`).join(' ')}\n`;
    }

    const metadata: KnowledgeMetadata = {
      title,
      author: author || undefined,
      sourceUrl,
      platform: 'xiaohongshu',
      tags: tags.length > 0 ? tags : undefined,
      coverUrl: images[0] || undefined,
      likeCount: note.interactInfo?.likedCount ? parseInt(note.interactInfo.likedCount, 10) : undefined,
      clippedAt: new Date().toISOString(),
    };

    return {
      metadata,
      markdown: markdown.trim(),
      images,
    };
  }

  private extractFromDom(html: string, sourceUrl: string): ExtractedArticle {
    const doc = parseHtmlToDocument(html);

    const title =
      doc.querySelector('#detail-title')?.textContent?.trim() ||
      doc.querySelector('.title')?.textContent?.trim() ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      doc.title?.replace(/- 小红书$/, '').trim() ||
      '小红书笔记';

    const author =
      doc.querySelector('.username')?.textContent?.trim() ||
      doc.querySelector('.author-name')?.textContent?.trim() ||
      doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      '';

    const descEl = doc.querySelector('#detail-desc') || doc.querySelector('.desc') || doc.querySelector('.note-text');
    const desc = descEl ? convertHtmlToMarkdown(descEl) : '';

    const images: string[] = [];
    doc.querySelectorAll('.media-container img, .carousel img, .slider-item img, img.note-slider-img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && !src.startsWith('data:')) {
        const cleanUrl = src.startsWith('//') ? `https:${src}` : src;
        if (!images.includes(cleanUrl)) {
          images.push(cleanUrl);
        }
      }
    });

    let markdown = `# ${title}\n\n`;
    if (author) markdown += `> **作者**：${author}\n\n`;
    if (desc) markdown += `${desc}\n\n`;

    if (images.length > 0) {
      markdown += `### 笔记贴图 (${images.length} 张)\n\n`;
      images.forEach((imgUrl, idx) => {
        markdown += `![图片 ${idx + 1}](${imgUrl})\n\n`;
      });
    }

    const metadata: KnowledgeMetadata = {
      title,
      author: author || undefined,
      sourceUrl,
      platform: 'xiaohongshu',
      coverUrl: images[0] || undefined,
      clippedAt: new Date().toISOString(),
    };

    return {
      metadata,
      markdown: markdown.trim(),
      images,
    };
  }
}
