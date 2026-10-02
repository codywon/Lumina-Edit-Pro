import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import { convertHtmlToMarkdown } from '../htmlToMarkdown';
import type { ExtractedArticle, KnowledgeAdapter, KnowledgeMetadata } from '../types';

export class WechatAdapter implements KnowledgeAdapter {
  platform = 'wechat' as const;

  canHandle(url: string): boolean {
    return /mp\.weixin\.qq\.com/i.test(url);
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

    // 1. Extract metadata
    const title =
      doc.querySelector('#activity-name')?.textContent?.trim() ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      doc.title?.replace(/- 微信公众平台$/, '').trim() ||
      '微信公众号文章';

    const author =
      doc.querySelector('#js_name')?.textContent?.trim() ||
      doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('.profile_nickname')?.textContent?.trim() ||
      '';

    const coverUrl =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() ||
      '';

    let publishDate = '';
    const publishTimeEl = doc.querySelector('#publish_time');
    if (publishTimeEl?.textContent?.trim()) {
      publishDate = publishTimeEl.textContent.trim();
    } else {
      // Find createTime timestamp in script tags
      const scripts = doc.querySelectorAll('script');
      for (const s of Array.from(scripts)) {
        const text = s.textContent || '';
        const match = text.match(/(?:createTime|ct)\s*=\s*['"]?(\d{10})['"]?/);
        if (match) {
          const ts = parseInt(match[1], 10) * 1000;
          publishDate = new Date(ts).toISOString().split('T')[0];
          break;
        }
      }
    }

    // 2. Extract and sanitize content
    const contentEl = (doc.querySelector('#js_content') || doc.body).cloneNode(true) as HTMLElement;

    // Remove WeChat noise
    const noiseSelectors = [
      '#js_toobar',
      '.qr_code_pc',
      '.reward_area',
      '.weui-flex',
      '.profile_container',
      '.rich_media_tool',
      '#js_pc_qr_code',
      '.original_area_primary',
      '#js_tags',
    ];
    noiseSelectors.forEach((sel) => {
      contentEl.querySelectorAll(sel).forEach((el) => el.remove());
    });

    // Normalize WeChat lazy-loaded images: replace data-src with src
    const images: string[] = [];
    contentEl.querySelectorAll('img').forEach((img) => {
      const dataSrc =
        img.getAttribute('data-src') ||
        img.getAttribute('data-original-src') ||
        img.getAttribute('src');

      if (dataSrc && !dataSrc.startsWith('data:')) {
        img.setAttribute('src', dataSrc);
        images.push(dataSrc);
      }
    });

    // 3. Convert to Markdown
    let markdown = convertHtmlToMarkdown(contentEl, { baseUrl: url });

    // Clean up excessive blank lines
    markdown = markdown.trim();

    const metadata: KnowledgeMetadata = {
      title,
      author: author || undefined,
      publishDate: publishDate || undefined,
      sourceUrl: url,
      platform: 'wechat',
      coverUrl: coverUrl || undefined,
      clippedAt: new Date().toISOString(),
    };

    return {
      metadata,
      markdown,
      images,
    };
  }
}
