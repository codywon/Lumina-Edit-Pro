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
      html = res.content;
    }

    const doc = parseHtmlToDocument(html);
    return extractArticleFromDocument(doc, url);
  }
}
