import { networkFetchText } from '../../../services/native';
import { parseHtmlToDocument } from '../domHelper';
import { convertHtmlToMarkdown } from '../htmlToMarkdown';
import type { ExtractedArticle, KnowledgeAdapter, KnowledgeMetadata } from '../types';

export class FeishuAdapter implements KnowledgeAdapter {
  platform = 'feishu' as const;

  canHandle(url: string): boolean {
    return /feishu\.cn|larksuite\.com/i.test(url);
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

    // 1. Title extraction
    const rawTitle =
      doc.querySelector('.docx-title')?.textContent?.trim() ||
      doc.querySelector('.doc-title')?.textContent?.trim() ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      doc.title ||
      '飞书云文档';

    const cleanTitle = rawTitle.replace(/\s*-\s*(飞书云文档|Lark Docs|Feishu)\s*$/i, '').trim();

    // 2. Author and date
    const author =
      doc.querySelector('.author-name')?.textContent?.trim() ||
      doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      '';

    // 3. Locate content container
    const contentSelectors = [
      '.docx-page',
      '.suite-doc-content',
      '.slate-editor',
      '.wiki-content',
      '.doc-page-container',
      'article',
      'main',
      '#root',
    ];

    let contentEl: Element | null = null;
    for (const sel of contentSelectors) {
      const found = doc.querySelector(sel);
      if (found && (found.textContent || '').trim().length > 30) {
        contentEl = found.cloneNode(true) as Element;
        break;
      }
    }

    if (!contentEl) {
      contentEl = doc.body.cloneNode(true) as Element;
    }

    // 4. Preprocess Feishu components
    this.preprocessFeishuDom(contentEl as HTMLElement);

    // 5. Extract images
    const images: string[] = [];
    contentEl.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && !src.startsWith('data:') && !images.includes(src)) {
        images.push(src);
      }
    });

    // 6. Convert to Markdown
    let bodyMarkdown = convertHtmlToMarkdown(contentEl, { baseUrl: url }).trim();
    let markdown = '';
    if (cleanTitle && !bodyMarkdown.startsWith('# ')) {
      markdown = `# ${cleanTitle}\n\n${bodyMarkdown}`;
    } else {
      markdown = bodyMarkdown;
    }

    const metadata: KnowledgeMetadata = {
      title: cleanTitle,
      author: author || undefined,
      sourceUrl: url,
      platform: 'feishu',
      clippedAt: new Date().toISOString(),
    };

    return {
      metadata,
      markdown,
      images,
    };
  }

  private preprocessFeishuDom(root: HTMLElement): void {
    // Convert Feishu Callout blocks to alert blockquote
    root.querySelectorAll('[data-block-type="callout"], .callout-block, .callout-wrapper').forEach((el) => {
      el.classList.add('callout');
      el.setAttribute('data-callout-type', 'NOTE');
    });

    // Convert Feishu task items
    root.querySelectorAll('[data-block-type="todo"], .todo-block, .task-list-item').forEach((el) => {
      const checked = el.getAttribute('data-checked') === 'true' || el.querySelector('input:checked');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      if (checked) checkbox.setAttribute('checked', 'checked');
      el.prepend(checkbox);
    });

    // Remove Feishu floating bars, toolbars, comment bars
    const noise = [
      '.suite-comment-container',
      '.docx-reaction-container',
      '.header-toolbar',
      '.sidebar-wrapper',
      '.suite-nav-bar',
      '.suite-floating-menu',
    ];
    noise.forEach((sel) => {
      root.querySelectorAll(sel).forEach((e) => e.remove());
    });
  }
}
