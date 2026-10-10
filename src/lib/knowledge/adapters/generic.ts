import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import type { ExtractedArticle, KnowledgeAdapter, KnowledgeMetadata } from '../types';
import { extractArticleFromDocument } from '../universalExtractor';

/**
 * Intelligent fallback via headless cloud reader proxy (e.g. Jina Reader)
 * Bypasses WAF, JavaScript challenges, and anti-crawler blocks (Zhihu, Cloudflare, etc.)
 */
export async function extractViaReaderProxy(url: string): Promise<ExtractedArticle | null> {
  try {
    const readerRes = await networkFetchText({
      url: `https://r.jina.ai/${url}`,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'x-wait-for-selector': '.Post-RichText, .RichText, article, main, #content, .content',
        'x-timeout': '15',
      },
    });

    if (!readerRes.content || readerRes.status < 200 || readerRes.status >= 300) {
      return null;
    }

    const text = readerRes.content.trim();
    if (
      text.length < 100 ||
      text.includes('Warning: This page maybe not yet fully loaded') ||
      text.includes('发现问题背后的世界')
    ) {
      return null;
    }

    // Parse Title
    let title = '';
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Parse Body
    let body = text;
    const contentMarker = 'Markdown Content:';
    const markerIdx = text.indexOf(contentMarker);
    if (markerIdx !== -1) {
      body = text.slice(markerIdx + contentMarker.length).trim();
    }

    if (!body || body.length < 50) return null;

    // Extract all image URLs
    const images: string[] = [];
    const imgRegex = /!\[.*?\]\(([^\s\)]+)(?:\s+["'].*?["'])?\)/g;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(body)) !== null) {
      if (m[1] && !m[1].startsWith('data:') && !images.includes(m[1])) {
        images.push(m[1]);
      }
    }

    const metadata: KnowledgeMetadata = {
      title: title || '网页知识剪藏',
      sourceUrl: url,
      platform: 'generic',
      clippedAt: new Date().toISOString(),
    };

    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch {}

    const metaHeader = domain ? `> **来源**：[${domain}](${url})` : '';
    const fullMarkdown =
      title && !body.startsWith('# ')
        ? metaHeader
          ? `# ${title}\n\n${metaHeader}\n\n${body}`
          : `# ${title}\n\n${body}`
        : metaHeader
        ? `${metaHeader}\n\n${body}`
        : body;

    return {
      metadata,
      markdown: fullMarkdown,
      images,
    };
  } catch {
    return null;
  }
}

export class GenericWebAdapter implements KnowledgeAdapter {
  platform = 'generic' as const;

  canHandle(url: string): boolean {
    return /^https?:\/\//i.test(url);
  }

  async extract(url: string, rawHtml?: string): Promise<ExtractedArticle> {
    let html = rawHtml;
    let directFetchBlocked = false;

    if (!html) {
      try {
        const res = await networkFetchText({
          url,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });

        const isBlockStatus = res.status === 403 || res.status === 401;
        const isBlockContent =
          res.content.includes('zh-zse-ck') ||
          res.content.includes('cf-browser-verification') ||
          res.content.includes('Just a moment...') ||
          res.content.includes('发现问题背后的世界');

        if (isBlockStatus || isBlockContent) {
          directFetchBlocked = true;
        } else {
          html = res.content;
        }
      } catch {
        directFetchBlocked = true;
      }
    }

    // Attempt intelligent headless reader bypass if direct fetch was blocked
    if (directFetchBlocked || !html) {
      const readerArticle = await extractViaReaderProxy(url);
      if (readerArticle) {
        return readerArticle;
      }

      if (/zhihu\.com/i.test(url)) {
        throw new Error('知乎开启了反爬风控拦截（HTTP 403，需要登录验证）。请在浏览器中打开文章并复制内容，切换至【粘贴内容】直接导入！');
      }
      throw new Error('目标网站限制了直接自动化访问 (WAF/403)。请在浏览器中打开页面并复制内容，切换至【粘贴内容】直接导入。');
    }

    const doc = parseHtmlToDocument(html);
    const article = extractArticleFromDocument(doc, url);

    // If result body is basically empty or only contains anti-bot messages, try fallback
    const bodyText = article.markdown.replace(/^#\s+[^\n]+/, '').trim();
    if (!bodyText || bodyText.length < 40 || bodyText.includes('发现问题背后的世界')) {
      const fallbackArticle = await extractViaReaderProxy(url);
      if (fallbackArticle) {
        return fallbackArticle;
      }

      if (/zhihu\.com/i.test(url)) {
        throw new Error('知乎开启了反爬风控拦截（需要登录验证）。请在浏览器中打开文章并复制内容，切换至【粘贴内容】即可直接导入！');
      }
    }

    return article;
  }
}
