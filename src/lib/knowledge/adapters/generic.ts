import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import { convertHtmlToMarkdown } from '../htmlToMarkdown';
import type { ExtractedArticle, KnowledgeAdapter, KnowledgeMetadata } from '../types';

export class GenericWebAdapter implements KnowledgeAdapter {
  platform = 'generic' as const;

  canHandle(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  async extract(url: string, rawHtml?: string): Promise<ExtractedArticle> {
    let html = rawHtml;
    if (!html) {
      const res = await networkFetchText({
        url,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      html = res.content;
    }

    const doc = parseHtmlToDocument(html);

    // 1. Title
    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      doc.title?.trim() ||
      '网页知识剪藏';

    // 2. Author
    const author =
      doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('meta[property="article:author"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('[rel="author"]')?.textContent?.trim() ||
      '';

    // 3. Date
    const publishDate =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content')?.split('T')[0] ||
      doc.querySelector('time')?.getAttribute('datetime')?.split('T')[0] ||
      '';

    // 4. Tags
    const tags: string[] = [];
    const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
    if (keywords) {
      keywords.split(/[,，]/).forEach((k) => {
        const clean = k.trim();
        if (clean && clean.length <= 20) tags.push(clean);
      });
    }

    // 5. Locate best content container
    const candidates = [
      'article',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.markdown-body',
      '#content',
      '#main-content',
    ];

    let contentEl: Element | null = null;
    for (const sel of candidates) {
      const found = doc.querySelector(sel);
      if (found && (found.textContent || '').trim().length > 100) {
        contentEl = found.cloneNode(true) as Element;
        break;
      }
    }

    if (!contentEl) {
      contentEl = doc.body.cloneNode(true) as Element;
    }

    // Remove noise elements
    const noise = [
      'nav',
      'header',
      'footer',
      'aside',
      '.navbar',
      '.sidebar',
      '.advertisement',
      '.ad-container',
      '.comment-section',
      '.comments',
      '.share-buttons',
      '.popup',
      '.modal',
    ];
    noise.forEach((sel) => {
      contentEl?.querySelectorAll(sel).forEach((e) => e.remove());
    });

    // Extract images
    const images: string[] = [];
    contentEl.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && !src.startsWith('data:') && !images.includes(src)) {
        images.push(src);
      }
    });

    let bodyMarkdown = convertHtmlToMarkdown(contentEl, { baseUrl: url }).trim();

    const metaParts: string[] = [];
    if (author) metaParts.push(`**作者**：${author}`);
    if (publishDate) metaParts.push(`**发布时间**：${publishDate}`);
    if (url) {
      try {
        const domain = new URL(url).hostname;
        metaParts.push(`**来源**：[${domain}](${url})`);
      } catch {
        metaParts.push(`**来源**：[原文链接](${url})`);
      }
    }
    const metaHeader = metaParts.length > 0 ? `> ${metaParts.join(' · ')}` : '';

    let markdown = '';
    if (title && !bodyMarkdown.startsWith('# ')) {
      markdown = metaHeader ? `# ${title}\n\n${metaHeader}\n\n${bodyMarkdown}` : `# ${title}\n\n${bodyMarkdown}`;
    } else {
      markdown = metaHeader ? `${metaHeader}\n\n${bodyMarkdown}` : bodyMarkdown;
    }

    const metadata: KnowledgeMetadata = {
      title,
      author: author || undefined,
      publishDate: publishDate || undefined,
      sourceUrl: url,
      platform: 'generic',
      tags: tags.length > 0 ? tags.slice(0, 5) : undefined,
      clippedAt: new Date().toISOString(),
    };

    return {
      metadata,
      markdown,
      images,
    };
  }
}
