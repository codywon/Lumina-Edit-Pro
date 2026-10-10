import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../frontmatter';
import {
  buildFrontmatter,
  cleanUniversalTitle,
  convertHtmlToMarkdown,
  detectPlatform,
  extractArticleFromUrl,
  extractImageUrls,
  extractJsonLdMetadata,
  getExtensionFromContentType,
  getPlatformLabel,
  prepareClippedDocument,
  scoreAndSelectArticleElement,
  WechatAdapter,
  XiaohongshuAdapter,
  FeishuAdapter,
  GenericWebAdapter,
  getEffectiveImgSrc,
  isPlaceholderImage,
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

  describe('GenericWebAdapter - Forum and Discuz parsing', () => {
    it('correctly extracts Discuz forum thread, ignores none.gif, resolves zoomfile images, and removes jammers', async () => {
      const adapter = new GenericWebAdapter();
      const mockDiscuzHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>STM32WLE5系列之1-芯片介绍和开发环境搭建 - STM32团队 ST意法半导体中文论坛</title>
        </head>
        <body>
          <div class="main">
            <div class="floor-bbs">
              <div class="thread-div">
                <h2>STM32WLE5系列之1-芯片介绍和开发环境搭建</h2>
                <div class="thread-create-info">
                  <a class="user-a" href="space-uid-123.html">
                    <span>STMCU小助手</span>
                  </a>
                  <span class="thread-time">发布时间：2022-10-20 18:40</span>
                </div>
              </div>
              <div class="t_fsz">
                <table cellspacing="0" cellpadding="0">
                  <tr>
                    <td class="t_f" id="postmessage_12345">
                      <font face="Tahoma"><strong>简介</strong><br/>
                      <span style="display:none">noise123</span>提示：这里可以添加本文要记录的大概内容：<br/>
                      STM32WL系列是全球首款LoRa SOC芯片。<br/>
                      <font class="jammer">jammer456</font><br/>
                      </font>
                      <ignore_js_op>
                        <img alt="st-img" id="aimg_1" src="static/image/common/none.gif"
                             zoomfile="data/attachment/forum/202210/20/img1.png"
                             file="data/attachment/forum/202210/20/img1.png" class="zoom" />
                        <div class="tip tip_4 aimg_tip" id="aimg_1_menu" style="display: none">
                          <p><strong>ce248e.png</strong> <em>(162 KB, 下载次数: 47)</em></p>
                          <p><a href="#">下载附件</a></p>
                        </div>
                      </ignore_js_op>
                      <p>一、STM32WLE5资源介绍</p>
                      <ignore_js_op>
                        <img alt="st-img" id="aimg_2" src="static/image/common/none.gif"
                             zoomfile="data/attachment/forum/202210/20/img2.png"
                             file="data/attachment/forum/202210/20/img2.png" class="zoom" />
                        <div class="tip tip_4 aimg_tip" id="aimg_2_menu" style="display: none">
                          <p><strong>78a209.png</strong></p>
                        </div>
                      </ignore_js_op>
                    </td>
                  </tr>
                </table>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const result = await adapter.extract('https://shequ.stmicroelectronics.cn/thread-637348-1-1.html', mockDiscuzHtml);

      expect(result.metadata.title).toBe('STM32WLE5系列之1-芯片介绍和开发环境搭建');
      expect(result.metadata.author).toBe('STMCU小助手');
      expect(result.metadata.publishDate).toBe('2022-10-20');
      expect(result.metadata.platform).toBe('generic');

      // Verify text extraction
      expect(result.markdown).toContain('**简介**');
      expect(result.markdown).toContain('提示：这里可以添加本文要记录的大概内容：');
      expect(result.markdown).toContain('STM32WL系列是全球首款LoRa SOC芯片。');
      expect(result.markdown).toContain('一、STM32WLE5资源介绍');

      // Verify jammer and noise removal
      expect(result.markdown).not.toContain('noise123');
      expect(result.markdown).not.toContain('jammer456');
      expect(result.markdown).not.toContain('下载次数');
      expect(result.markdown).not.toContain('下载附件');
      expect(result.markdown).not.toContain('none.gif');

      // Verify images extraction with resolved URLs
      expect(result.images).toEqual([
        'https://shequ.stmicroelectronics.cn/data/attachment/forum/202210/20/img1.png',
        'https://shequ.stmicroelectronics.cn/data/attachment/forum/202210/20/img2.png',
      ]);
      expect(result.markdown).toContain('![st-img](https://shequ.stmicroelectronics.cn/data/attachment/forum/202210/20/img1.png)');
      expect(result.markdown).toContain('![st-img](https://shequ.stmicroelectronics.cn/data/attachment/forum/202210/20/img2.png)');

      // Verify preparation pipeline creates the correct filename and frontmatter
      const prepared = await prepareClippedDocument(result, {
        localizeAssets: false,
        includeFrontmatter: true,
      });
      expect(prepared.suggestedFileName).toBe('[通用网页] STM32WLE5系列之1-芯片介绍和开发环境搭建.md');
      expect(prepared.fullMarkdown).toContain('title: "STM32WLE5系列之1-芯片介绍和开发环境搭建"');
      expect(prepared.fullMarkdown).toContain('author: "STMCU小助手"');
      expect(prepared.fullMarkdown).toContain('publish_date: "2022-10-20"');
      expect(prepared.fullMarkdown).toContain('**简介**');
    });

    it('identifies placeholder images and extracts lazy attributes', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <img id="img1" src="static/image/common/none.gif" file="data/forum/real.png" />
        <img id="img2" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://cdn.example.com/lazy.jpg" />
        <img id="img3" src="https://cdn.example.com/direct.webp" />
      `);

      const img1 = dom.window.document.getElementById('img1');
      const img2 = dom.window.document.getElementById('img2');
      const img3 = dom.window.document.getElementById('img3');

      expect(isPlaceholderImage('static/image/common/none.gif')).toBe(true);
      expect(isPlaceholderImage('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')).toBe(true);
      expect(isPlaceholderImage('https://cdn.example.com/direct.webp')).toBe(false);

      expect(getEffectiveImgSrc(img1)).toBe('data/forum/real.png');
      expect(getEffectiveImgSrc(img2)).toBe('https://cdn.example.com/lazy.jpg');
      expect(getEffectiveImgSrc(img3)).toBe('https://cdn.example.com/direct.webp');
    });

    it('handles layout tables without flattening whole articles into a table row', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <table class="layout-wrapper">
          <tr>
            <td>
              <h2>章节标题</h2>
              <p>段落内容一</p>
              <pre><code>console.log('code');</code></pre>
              <p>段落内容二</p>
            </td>
          </tr>
        </table>
      `);

      const md = convertHtmlToMarkdown(dom.window.document);
      expect(md).toContain('## 章节标题');
      expect(md).toContain('段落内容一');
      expect(md).toContain('```');
      expect(md).toContain('console.log(\'code\');');
      expect(md).toContain('段落内容二');
      // Should NOT be formatted as a single row table
      expect(md).not.toMatch(/^\|\s*章节标题/);
    });
  });

  describe('Universal Web Extraction Engine (Readability & Schema.org)', () => {
    it('extracts metadata from Schema.org JSON-LD structured data', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Title - Brand Name</title>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": "Rust 与 WebAssembly 现代高性能架构实战",
            "author": {
              "@type": "Person",
              "name": "Ferris"
            },
            "datePublished": "2026-02-18T10:00:00Z",
            "keywords": ["Rust", "Wasm", "Performance"],
            "image": "https://example.com/cover.webp"
          }
          </script>
        </head>
        <body>
          <article><p>正文内容测试</p></article>
        </body>
        </html>
      `);

      const meta = extractJsonLdMetadata(dom.window.document);
      expect(meta.title).toBe('Rust 与 WebAssembly 现代高性能架构实战');
      expect(meta.author).toBe('Ferris');
      expect(meta.publishDate).toBe('2026-02-18');
      expect(meta.tags).toEqual(['Rust', 'Wasm', 'Performance']);
      expect(meta.coverUrl).toBe('https://example.com/cover.webp');
    });

    it('cleans site branding delimiters from titles', () => {
      expect(cleanUniversalTitle('深入理解分布式系统 | 开源技术周刊')).toBe('深入理解分布式系统');
      expect(cleanUniversalTitle('Linux 内核网络协议栈优化 - 极客架构师')).toBe('Linux 内核网络协议栈优化');
      expect(cleanUniversalTitle('CSS Container Queries 指南 — Web 前端开发')).toBe('CSS Container Queries 指南');
      expect(cleanUniversalTitle('人工智能新突破 » AI 前沿观察')).toBe('人工智能新突破');
      expect(cleanUniversalTitle('单段标题没有任何分隔符')).toBe('单段标题没有任何分隔符');
    });

    it('isolates main article content and filters high link-density navigation and footers', async () => {
      const adapter = new GenericWebAdapter();
      const mockDocPageHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>微服务设计模式全解析 | 架构师笔记</title>
          <meta name="author" content="Martin" />
          <meta property="article:published_time" content="2026-01-15" />
        </head>
        <body>
          <nav class="site-navigation">
            <ul>
              <li><a href="/home">首页</a></li>
              <li><a href="/docs">文档中心</a></li>
              <li><a href="/pricing">企业版定价</a></li>
              <li><a href="/about">关于我们</a></li>
              <li><a href="/blog">博客最新动态</a></li>
            </ul>
          </nav>

          <aside class="sidebar-links">
            <div class="widget">
              <h3>推荐阅读</h3>
              <ul>
                <li><a href="/post1">推荐文章一链接</a></li>
                <li><a href="/post2">推荐文章二链接</a></li>
                <li><a href="/post3">推荐文章三链接</a></li>
              </ul>
            </div>
          </aside>

          <main class="page-content">
            <div class="article-wrapper">
              <h1>微服务设计模式全解析</h1>
              <p>在分布式微服务架构中，服务边界划分与数据一致性是核心考量点。本文将详细探讨三种常用的模式：Saga 模式、CQRS 模式与事件驱动架构。</p>
              <h2>1. Saga 模式与长事务处理</h2>
              <p>传统分布式两阶段提交（2PC）往往带来极高的锁竞争与性能瓶颈。Saga 模式通过将大事务切分为一系列有序的局部事务，并在失败时依次触发补偿操作，从而实现最终一致性。</p>
              <pre class="language-typescript"><code>interface SagaStep&lt;T&gt; {\n  execute: () =&gt; Promise&lt;T&gt;;\n  compensate: () =&gt; Promise&lt;void&gt;;\n}</code></pre>
              <h2>2. CQRS 读写分离</h2>
              <p>CQRS 将读操作与写操作完全分离为不同的数据模型，写端专注于业务完整性约束，读端针对查询场景极致调优。</p>
            </div>
          </main>

          <footer class="site-footer">
            <p>Copyright © 2026 架构师笔记. All rights reserved.</p>
            <div class="footer-links">
              <a href="/privacy">隐私政策</a>
              <a href="/terms">用户协议</a>
            </div>
          </footer>
        </body>
        </html>
      `;

      const result = await adapter.extract('https://example.com/microservices-patterns', mockDocPageHtml);

      expect(result.metadata.title).toBe('微服务设计模式全解析');
      expect(result.metadata.author).toBe('Martin');
      expect(result.metadata.publishDate).toBe('2026-01-15');

      // Verify main content is preserved
      expect(result.markdown).toContain('在分布式微服务架构中，服务边界划分与数据一致性是核心考量点。');
      expect(result.markdown).toContain('Saga 模式与长事务处理');
      expect(result.markdown).toContain('interface SagaStep<T>');
      expect(result.markdown).toContain('CQRS 读写分离');

      // Verify navigation, sidebar link farms, and footers are omitted
      expect(result.markdown).not.toContain('企业版定价');
      expect(result.markdown).not.toContain('推荐文章一链接');
      expect(result.markdown).not.toContain('隐私政策');
      expect(result.markdown).not.toContain('All rights reserved');
    });
  });
});
