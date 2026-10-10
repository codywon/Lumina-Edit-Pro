import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import type { ExtractedArticle, KnowledgeAdapter } from '../types';
import { extractArticleFromDocument } from '../universalExtractor';

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
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      if (res.status === 403 || res.status === 401) {
        if (/zhihu\.com/i.test(url) || res.content.includes('zh-zse-ck') || res.content.includes('发现问题背后的世界')) {
          throw new Error('知乎开启了反爬风控拦截（HTTP 403，需要登录验证）。请在浏览器中打开文章并复制内容，切换至【粘贴内容】即可直接导入！');
        }
        throw new Error(`目标网站限制了直接自动化访问 (HTTP ${res.status})。请在浏览器中打开页面并复制内容，切换至【粘贴内容】直接导入。`);
      }

      if (res.content.includes('zh-zse-ck') || res.content.includes('发现问题背后的世界')) {
        throw new Error('知乎开启了反爬风控拦截（需要登录验证）。请在浏览器中打开文章并复制内容，切换至【粘贴内容】即可直接导入！');
      }

      html = res.content;
    }

    const doc = parseHtmlToDocument(html);
    const article = extractArticleFromDocument(doc, url);

    // If result body is basically empty or only contains anti-bot messages
    const bodyText = article.markdown.replace(/^#\s+[^\n]+/, '').trim();
    if (!bodyText || bodyText.length < 30 || bodyText.includes('发现问题背后的世界')) {
      if (/zhihu\.com/i.test(url)) {
        throw new Error('知乎开启了反爬风控拦截（需要登录验证）。请在浏览器中打开文章并复制内容，切换至【粘贴内容】即可直接导入！');
      }
    }

    return article;
  }
}
