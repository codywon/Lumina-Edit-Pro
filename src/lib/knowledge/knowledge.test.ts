import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../frontmatter';
import {
  buildFrontmatter,
  convertHtmlToMarkdown,
  detectPlatform,
  extractArticleFromUrl,
  extractImageUrls,
  getExtensionFromContentType,
  getPlatformLabel,
  prepareClippedDocument,
  WechatAdapter,
  XiaohongshuAdapter,
  FeishuAdapter,
  GenericWebAdapter,
} from './index';

describe('Knowledge Sources & Web Clipper', () => {
  describe('Platform Detection', () => {
    it('correctly identifies platforms from URL', () => {
      expect(detectPlatform('https://mp.weixin.qq.com/s/abcdef123')).toBe('wechat');
      expect(detectPlatform('https://www.xiaohongshu.com/explore/65e9123456')).toBe('xiaohongshu');
      expect(detectPlatform('http://xhslink.com/a/xyz789')).toBe('xiaohongshu');
      expect(detectPlatform('https://bytedance.feishu.cn/docx/doxcnabcdef123456')).toBe('feishu');
      expect(detectPlatform('https://company.larksuite.com/wiki/wikcn123456')).toBe('feishu');
      expect(detectPlatform('https://github.com/codywon/Lumina-Edit-Pro')).toBe('generic');
      expect(detectPlatform('https://juejin.cn/post/123456789')).toBe('generic');
    });

    it('returns human-readable labels', () => {
      expect(getPlatformLabel('wechat')).toBe('微信公众号');
      expect(getPlatformLabel('xiaohongshu')).toBe('小红书');
      expect(getPlatformLabel('feishu')).toBe('飞书文档');
      expect(getPlatformLabel('generic')).toBe('通用网页');
    });
  });

  describe('HTML to Markdown Converter', () => {
    it('converts basic elements and styles', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <h1>主标题</h1>
        <p>这是一段包含 <strong>加粗</strong>、<em>斜体</em> 和 <code>行内代码</code> 的正文。</p>
        <p>换行测试<br/>第二行</p>
      `);

      const md = convertHtmlToMarkdown(dom.window.document);
      expect(md).toContain('# 主标题');
      expect(md).toContain('**加粗**');
      expect(md).toContain('*斜体*');
      expect(md).toContain('`行内代码`');
      expect(md).toContain('换行测试\n第二行');
    });

    it('converts code blocks with language', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <pre class="language-typescript"><code>const greeting: string = "hello";\nconsole.log(greeting);</code></pre>
      `);

      const md = convertHtmlToMarkdown(dom.window.document);
      expect(md).toContain('```typescript');
      expect(md).toContain('const greeting: string = "hello";');
      expect(md).toContain('```');
    });

    it('converts GFM tables with alignment', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <table>
          <thead>
            <tr>
              <th align="left">功能</th>
              <th align="center">支持状态</th>
              <th align="right">耗时</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>微信公众号</td>
              <td>已实现</td>
              <td>120ms</td>
            </tr>
            <tr>
              <td>飞书云文档</td>
              <td>已实现</td>
              <td>230ms</td>
            </tr>
          </tbody>
        </table>
      `);

      const md = convertHtmlToMarkdown(dom.window.document);
      expect(md).toContain('| 功能 | 支持状态 | 耗时 |');
      expect(md).toContain('| --- | :---: | ---: |');
      expect(md).toContain('| 微信公众号 | 已实现 | 120ms |');
    });

    it('converts task lists and callout alerts', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <div class="callout" data-callout-type="TIP">
          <p>这是重要提示信息</p>
        </div>
        <ul>
          <li>普通列表项 1</li>
          <li>普通列表项 2</li>
        </ul>
      `);

      const md = convertHtmlToMarkdown(dom.window.document);
      expect(md).toContain('> [!TIP]');
      expect(md).toContain('> 这是重要提示信息');
      expect(md).toContain('- 普通列表项 1');
    });
  });

  describe('WechatAdapter', () => {
    it('extracts WeChat metadata, clean content, and converts data-src images', async () => {
      const adapter = new WechatAdapter();
      const mockWechatHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>公众号测试文章 - 微信公众平台</title>
          <meta property="og:title" content="AI新时代的知识管理" />
          <meta name="author" content="Lumina科技" />
        </head>
        <body>
          <h1 id="activity-name">AI新时代的知识管理</h1>
          <div id="js_name">Lumina科技</div>
          <div id="publish_time">2026-03-01</div>
          <div id="js_content">
            <p>本文探讨如何高效搭建个人离线知识体系。</p>
            <img data-src="https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png" alt="配图1" />
            <div id="js_toobar">点赞在看分享按钮</div>
            <div class="qr_code_pc">二维码广告</div>
          </div>
        </body>
        </html>
      `;

      const result = await adapter.extract('https://mp.weixin.qq.com/s/sample123', mockWechatHtml);
      expect(result.metadata.title).toBe('AI新时代的知识管理');
      expect(result.metadata.author).toBe('Lumina科技');
      expect(result.metadata.publishDate).toBe('2026-03-01');
      expect(result.metadata.platform).toBe('wechat');
      expect(result.markdown).toContain('本文探讨如何高效搭建个人离线知识体系。');
      expect(result.markdown).toContain('![配图1](https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png)');
      // Verify noise removal
      expect(result.markdown).not.toContain('点赞在看分享按钮');
      expect(result.markdown).not.toContain('二维码广告');
      expect(result.images).toContain('https://mmbiz.qpic.cn/mmbiz_png/abc123/0?wx_fmt=png');
    });
  });

  describe('XiaohongshuAdapter', () => {
    it('extracts note details and high-res images from __INITIAL_STATE__', async () => {
      const adapter = new XiaohongshuAdapter();
      const mockState = {
        note: {
          noteDetailMap: {
            note_123: {
              note: {
                title: '北京超好拍的宝藏艺术展',
                desc: '周末发现了这个绝美的展览，光影效果太棒了！大家快冲！\n#周末去哪儿 #艺术展',
                user: { nickname: '摄影达人小鹿' },
                tagList: [{ name: '周末去哪儿' }, { name: '艺术展' }],
                imageList: [
                  { urlDefault: 'https://sns-webpic-qc.xhscdn.com/2026/img1.jpg' },
                  { urlDefault: 'https://sns-webpic-qc.xhscdn.com/2026/img2.jpg' },
                ],
                interactInfo: { likedCount: '3500' },
              },
            },
          },
        },
      };

      const mockXhsHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>小红书</title></head>
        <body>
          <div id="app"></div>
          <script>window.__INITIAL_STATE__ = ${JSON.stringify(mockState)};</script>
        </body>
        </html>
      `;

      const result = await adapter.extract('https://www.xiaohongshu.com/explore/note_123', mockXhsHtml);
      expect(result.metadata.title).toBe('北京超好拍的宝藏艺术展');
      expect(result.metadata.author).toBe('摄影达人小鹿');
      expect(result.metadata.platform).toBe('xiaohongshu');
      expect(result.metadata.tags).toEqual(['周末去哪儿', '艺术展']);
      expect(result.markdown).toContain('# 北京超好拍的宝藏艺术展');
      expect(result.markdown).toContain('周末发现了这个绝美的展览');
      expect(result.markdown).toContain('![图片 1](https://sns-webpic-qc.xhscdn.com/2026/img1.jpg)');
      expect(result.markdown).toContain('![图片 2](https://sns-webpic-qc.xhscdn.com/2026/img2.jpg)');
      expect(result.images.length).toBe(2);
    });
  });

  describe('FeishuAdapter', () => {
    it('extracts and converts Feishu documents with Callouts and Todos', async () => {
      const adapter = new FeishuAdapter();
      const mockFeishuHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>2026 Q1 产品演进规划 - 飞书云文档</title>
        </head>
        <body>
          <div class="docx-page">
            <h1 class="docx-title">2026 Q1 产品演进规划</h1>
            <div class="callout-block" data-block-type="callout">
              <p>团队核心目标：打造全球最易用的 AI Markdown 编辑器。</p>
            </div>
            <p>本季度重点交付知识来源与多平台剪藏能力。</p>
            <div class="task-item" data-block-type="todo" data-checked="true">完成架构设计规范</div>
            <div class="task-item" data-block-type="todo" data-checked="false">完成全自动化测试</div>
          </div>
        </body>
        </html>
      `;

      const result = await adapter.extract('https://example.feishu.cn/docx/dox123', mockFeishuHtml);
      expect(result.metadata.title).toBe('2026 Q1 产品演进规划');
      expect(result.metadata.platform).toBe('feishu');
      expect(result.markdown).toContain('> [!NOTE]');
      expect(result.markdown).toContain('打造全球最易用的 AI Markdown 编辑器');
      expect(result.markdown).toContain('- [x] 完成架构设计规范');
      expect(result.markdown).toContain('- [ ] 完成全自动化测试');
    });
  });

  describe('Asset Localizer utilities', () => {
    it('extracts image URLs from mixed Markdown and HTML', () => {
      const md = `
        # 文章
        ![封面](https://cdn.example.com/cover.png)
        正文描述...
        <img src="https://cdn.example.com/photo.jpg" alt="照相" />
        <img src="data:image/png;base64,xxxx" /> <!-- should be ignored -->
        ![已是本地图](./.assets/local.png) <!-- should be ignored -->
      `;

      const urls = extractImageUrls(md);
      expect(urls).toEqual([
        'https://cdn.example.com/cover.png',
        'https://cdn.example.com/photo.jpg',
      ]);
    });

    it('infers file extension from contentType or query params', () => {
      expect(getExtensionFromContentType('image/png', 'https://example.com/pic')).toBe('.png');
      expect(getExtensionFromContentType('image/jpeg', 'https://example.com/pic')).toBe('.jpg');
      expect(getExtensionFromContentType('image/webp', 'https://example.com/pic')).toBe('.webp');
      expect(getExtensionFromContentType('', 'https://mmbiz.qpic.cn/pic?wx_fmt=png')).toBe('.png');
      expect(getExtensionFromContentType('', 'https://example.com/photo.gif')).toBe('.gif');
    });
  });

  describe('Frontmatter & Preparation Pipeline', () => {
    it('generates valid YAML frontmatter', () => {
      const fm = buildFrontmatter({
        title: '测试文档',
        author: '测试者',
        sourceUrl: 'https://example.com',
        platform: 'generic',
        tags: ['AI', '前端'],
        clippedAt: '2026-03-01T12:00:00.000Z',
      });

      expect(fm).toContain('---');
      expect(fm).toContain('title: "测试文档"');
      expect(fm).toContain('author: "测试者"');
      expect(fm).toContain('source_url: "https://example.com"');
      expect(fm).toContain('platform: generic');
      expect(fm).toContain('  - "AI"');
      expect(fm).toContain('  - "前端"');
    });

    it('prepares clipped document with suggested filename and frontmatter', async () => {
      const article = {
        metadata: {
          title: 'DeepSeek R1 深度技术剖析',
          author: '技术专家',
          sourceUrl: 'https://mp.weixin.qq.com/s/12345',
          platform: 'wechat' as const,
          clippedAt: '2026-03-01T12:00:00.000Z',
        },
        markdown: '正文深度内容...',
        images: [],
      };

      const prepared = await prepareClippedDocument(article, {
        localizeAssets: false,
        includeFrontmatter: true,
      });

      expect(prepared.suggestedFileName).toBe('[微信公众号] DeepSeek R1 深度技术剖析.md');
      expect(prepared.fullMarkdown).toContain('title: "DeepSeek R1 深度技术剖析"');
      expect(prepared.fullMarkdown).toContain('正文深度内容...');
    });

    it('correctly recovers and parses pseudo-heading corrupted frontmatter', async () => {
      const corrupted = `---

## title: "Hugging Face趋势榜第一" author: "黑虾" publish_date: "2026-09-22"

# Hugging Face趋势榜第一

> **作者**：黑虾
`;
      const res = parseFrontmatter(corrupted);
      expect(res.frontmatter).not.toBeNull();
      expect(res.frontmatter?.title).toBe('Hugging Face趋势榜第一');
      expect(res.frontmatter?.author).toBe('黑虾');
      expect(res.body.trim().startsWith('# Hugging Face趋势榜第一')).toBe(true);
    });
  });
});
