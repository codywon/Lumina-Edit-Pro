import { parseHtmlToDocument } from './domHelper';
import { convertHtmlToMarkdown, getEffectiveImgSrc, isPlaceholderImage, resolveUrl } from './htmlToMarkdown';
import type { ExtractedArticle, KnowledgeMetadata } from './types';

// ============================================================================
// 1. Universal Metadata Extraction (JSON-LD Schema.org, OpenGraph, Microdata)
// ============================================================================

/**
 * Universal title cleaner: strips site branding, channel names, and common delimiters
 * e.g. "STM32WLE5系列之1-芯片介绍 - ST中文论坛" -> "STM32WLE5系列之1-芯片介绍"
 * e.g. "React 19 Deep Dive | Overreacted" -> "React 19 Deep Dive"
 */
export function cleanUniversalTitle(rawTitle: string, docHeading?: string): string {
  if (!rawTitle) return '';
  const trimmed = rawTitle.trim();

  // If there is an explicit h1 or h2 on the page that matches part of the title, prefer that
  if (docHeading && docHeading.length >= 4 && trimmed.includes(docHeading)) {
    return docHeading.trim();
  }

  // Common universal delimiters separating title from site name: " - ", " | ", " _ ", " — ", " – ", " » ", " • "
  const delimiterRegex = /\s+(?:[-–—|»•_]|-(?!\w))\s+/;
  if (delimiterRegex.test(trimmed)) {
    const parts = trimmed.split(delimiterRegex);
    if (parts.length > 1) {
      // Pick the segment that looks most like an article title (usually the longest or first part)
      const first = parts[0].trim();
      const last = parts[parts.length - 1].trim();

      // If heading matches the first part, pick first
      if (first.length >= 6 && (!last || first.length >= last.length)) {
        return first;
      }
      // If the last segment is the longest, it might be "Site Name - Article Title"
      if (last.length > first.length && last.length >= 6) {
        return last;
      }
      return first;
    }
  }

  return trimmed;
}

/**
 * Parse Schema.org JSON-LD structured data embedded in <script type="application/ld+json">
 */
export function extractJsonLdMetadata(doc: Document): Partial<KnowledgeMetadata> {
  const result: Partial<KnowledgeMetadata> = {};
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

  for (const script of scripts) {
    try {
      const content = script.textContent?.trim();
      if (!content) continue;

      const data = JSON.parse(content);
      // Flatten potential @graph array or top-level array
      const items: any[] = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item['@type'] || '');

        // Match article-like Schema.org types
        if (/Article|NewsArticle|BlogPosting|TechArticle|ScholarlyArticle|Report|WebPage/i.test(type)) {
          // 1. Title
          if (!result.title && (item.headline || item.name)) {
            result.title = String(item.headline || item.name).trim();
          }

          // 2. Author
          if (!result.author && item.author) {
            if (typeof item.author === 'string') {
              result.author = item.author.trim();
            } else if (Array.isArray(item.author) && item.author.length > 0) {
              const first = item.author[0];
              result.author = (typeof first === 'string' ? first : first.name || '').trim();
            } else if (item.author.name) {
              result.author = String(item.author.name).trim();
            }
          }

          // 3. Date
          if (!result.publishDate) {
            const dateStr = item.datePublished || item.dateCreated || item.dateModified;
            if (dateStr) {
              result.publishDate = String(dateStr).split('T')[0].trim();
            }
          }

          // 4. Tags / Keywords
          if (!result.tags && item.keywords) {
            if (Array.isArray(item.keywords)) {
              result.tags = item.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 5);
            } else if (typeof item.keywords === 'string') {
              result.tags = item.keywords
                .split(/[,，]/)
                .map((k: string) => k.trim())
                .filter((k: string) => k && k.length <= 25)
                .slice(0, 5);
            }
          }

          // 5. Cover Image
          if (!result.coverUrl && item.image) {
            if (typeof item.image === 'string') {
              result.coverUrl = item.image.trim();
            } else if (Array.isArray(item.image) && item.image.length > 0) {
              const firstImg = item.image[0];
              result.coverUrl = (typeof firstImg === 'string' ? firstImg : firstImg.url || '').trim();
            } else if (item.image.url) {
              result.coverUrl = String(item.image.url).trim();
            }
          }
        }
      }
    } catch {
      // JSON syntax error in LD+JSON, ignore and proceed
    }
  }

  return result;
}

/**
 * Extract universal metadata through multi-layered cascade:
 * 1. JSON-LD Schema.org -> 2. OpenGraph / Twitter -> 3. Standard Semantic HTML
 */
export function extractUniversalMetadata(doc: Document, sourceUrl: string): KnowledgeMetadata {
  const jsonLd = extractJsonLdMetadata(doc);

  // Fallback heading
  const docHeading =
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('[itemprop="headline"]')?.textContent?.trim() ||
    doc.querySelector('.entry-title, .post-title, .article-title, .thread-title')?.textContent?.trim() ||
    '';

  // 1. Title
  const rawTitle =
    jsonLd.title ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content')?.trim() ||
    docHeading ||
    doc.title?.trim() ||
    '网页知识剪藏';

  const title = cleanUniversalTitle(rawTitle, docHeading) || rawTitle;

  // 2. Author
  let author =
    jsonLd.author ||
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[property="article:author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('[rel="author"]')?.textContent?.trim() ||
    doc.querySelector('[itemprop="author"]')?.textContent?.trim() ||
    doc
      .querySelector(
        '[class*="author" i], [class*="byline" i], [class*="creator" i], [class*="username" i], [class*="user-name" i], [class*="authi" i], [class*="poster" i], [class*="writer" i], a[href*="/user/"], a[href*="/author/"], a[href*="/u/"], a[href*="space-uid"]'
      )
      ?.textContent?.trim() ||
    '';

  // 3. Publish Date
  let publishDate = jsonLd.publishDate || '';
  if (!publishDate) {
    const dateEl = doc.querySelector(
      'meta[property="article:published_time"], meta[name="pubdate"], meta[name="publishdate"], meta[name="date"], time[datetime], [itemprop="datePublished"], [class*="publish-time" i], [class*="post-time" i], [class*="thread-time" i], [class*="date" i], time'
    );
    const rawDate =
      dateEl?.getAttribute('content')?.trim() ||
      dateEl?.getAttribute('datetime')?.trim() ||
      dateEl?.textContent?.trim() ||
      '';

    if (rawDate) {
      // Match ISO date or YYYY-MM-DD or YYYY/MM/DD or YYYY年MM月DD日
      const match = rawDate.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
      if (match) {
        publishDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      } else if (rawDate.includes('T')) {
        publishDate = rawDate.split('T')[0];
      }
    }
  }

  // 4. Tags
  let tags: string[] = jsonLd.tags || [];
  if (tags.length === 0) {
    const keywords =
      doc.querySelector('meta[name="keywords"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="article:tag"]')?.getAttribute('content');
    if (keywords) {
      keywords.split(/[,，]/).forEach((k) => {
        const clean = k.trim();
        if (clean && clean.length <= 25 && !tags.includes(clean)) {
          tags.push(clean);
        }
      });
    }
  }

  // 5. Cover Image
  const coverUrl =
    jsonLd.coverUrl ||
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() ||
    undefined;

  return {
    title,
    author: author || undefined,
    publishDate: publishDate || undefined,
    sourceUrl,
    platform: 'generic',
    tags: tags.length > 0 ? tags.slice(0, 5) : undefined,
    coverUrl: coverUrl ? resolveUrl(coverUrl, sourceUrl) : undefined,
    clippedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 2. Universal DOM Sanitization & Anti-Noise Filtering
// ============================================================================

const UNLIKELY_CANDIDATE_REGEX =
  /(?:^|[-_ \t])(?:ad|ads|advert|banner|combx|comment|comments|contact|disqus|extra|foot|footer|header|menu|nav|navbar|pager|pagination|popup|modal|dialog|remark|rss|share|shoutbox|sidebar|skyscraper|social|sponsor|toolbar|tooltip|widget|cookie|gdpr|login|register|newsletter|promo|recommend|related)(?:[-_ \t]|$)/i;

const POSITIVE_CANDIDATE_REGEX =
  /(?:^|[-_ \t])(?:article|body|content|entry|main|post|text|story|markdown|reader|blog|detail|topic)(?:[-_ \t]|$)/i;

/**
 * Remove noise, hidden elements, advertising, and scripts across any webpage
 */
export function sanitizeDocument(root: Element): void {
  // 1. Remove blacklisted tag names
  const stripTags = ['script', 'style', 'noscript', 'iframe', 'form', 'svg', 'button', 'canvas', 'select', 'textarea'];
  stripTags.forEach((tag) => {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  });

  // 2. Remove invisible elements, transparent watermarks, and zero-font jammers
  root.querySelectorAll('*').forEach((el) => {
    const style = (el.getAttribute('style') || '').toLowerCase();
    const ariaHidden = el.getAttribute('aria-hidden');
    const hidden = el.hasAttribute('hidden');

    if (
      hidden ||
      ariaHidden === 'true' ||
      /display\s*:\s*none/.test(style) ||
      /visibility\s*:\s*hidden/.test(style) ||
      /font-size\s*:\s*0(?:px)?/.test(style) ||
      /color\s*:\s*transparent/.test(style) ||
      /opacity\s*:\s*0(?:\.0+)?(?:\s*;|$)/.test(style) ||
      /text-indent\s*:\s*-[0-9]{3,}/.test(style)
    ) {
      el.remove();
    }
  });

  // 3. Remove negative structural elements (unless exempted by strong positive signals)
  root.querySelectorAll('div, section, aside, nav, footer, header, ul, ol, p, span').forEach((el) => {
    const classAttr = el.getAttribute('class') || '';
    const idAttr = el.getAttribute('id') || '';
    const roleAttr = el.getAttribute('role') || '';
    const combined = `${classAttr} ${idAttr} ${roleAttr}`;

    if (UNLIKELY_CANDIDATE_REGEX.test(combined) && !POSITIVE_CANDIDATE_REGEX.test(combined)) {
      // Don't remove if element is or contains a big article tag
      if (!el.querySelector('article') && el.tagName.toLowerCase() !== 'body') {
        el.remove();
      }
    }
  });
}

// ============================================================================
// 3. Universal Readability Content Scoring & Density Engine
// ============================================================================

/**
 * Calculate link density of a container element:
 * linkDensity = totalLinkTextLength / totalTextLength
 */
function getLinkDensity(el: Element): number {
  const totalLength = (el.textContent || '').trim().length;
  if (totalLength === 0) return 0;

  let linkLength = 0;
  el.querySelectorAll('a').forEach((a) => {
    linkLength += (a.textContent || '').trim().length;
  });

  return linkLength / totalLength;
}

/**
 * Scores candidate elements across the document based on text density,
 * paragraph counts, punctuation abundance, and semantic tag bonuses.
 */
export function scoreAndSelectArticleElement(root: Element): Element {
  const candidates: Array<{ element: Element; score: number }> = [];

  // Elements capable of holding content
  const potentialHolders = Array.from(root.querySelectorAll('article, section, main, div, td'));

  for (const el of potentialHolders) {
    const tag = el.tagName.toLowerCase();
    const classAttr = el.getAttribute('class') || '';
    const idAttr = el.getAttribute('id') || '';
    const combined = `${classAttr} ${idAttr}`;

    let score = 0;

    // 1. Tag base score
    if (tag === 'article') score += 35;
    else if (tag === 'main') score += 30;
    else if (tag === 'section') score += 15;
    else if (tag === 'div' || tag === 'td') score += 5;

    // 2. Class/ID semantic bonus/penalty
    if (POSITIVE_CANDIDATE_REGEX.test(combined)) score += 30;
    if (UNLIKELY_CANDIDATE_REGEX.test(combined)) score -= 25;

    // 3. Child paragraphs & content density
    const paragraphs = el.querySelectorAll('p, pre, blockquote, li, h2, h3, h4');
    let validParagraphCount = 0;
    let punctuationScore = 0;

    paragraphs.forEach((p) => {
      const text = (p.textContent || '').trim();
      if (text.length >= 20) {
        validParagraphCount++;
        // Long paragraph weight
        score += Math.min(Math.floor(text.length / 50), 6);
        // Narrative punctuation (commas, periods, question marks, CJK punctuation)
        const punctMatches = text.match(/[,.?!;:，。？！；：、“”]/g);
        if (punctMatches) {
          punctuationScore += punctMatches.length;
        }
        // Code blocks are strong tutorial signals
        if (p.tagName.toLowerCase() === 'pre') {
          score += 15;
        }
      }
    });

    score += validParagraphCount * 5 + punctuationScore * 1.5;

    // Count images inside content
    const imgCount = el.querySelectorAll('img').length;
    score += Math.min(imgCount * 10, 50);

    // 4. Link density penalty: navigation blocks, footers, and link farms have high link density
    const linkDensity = getLinkDensity(el);
    if (linkDensity > 0.45) {
      score *= 1 - linkDensity;
    }
    if (linkDensity > 0.75) {
      score = 0; // pure link list
    }

    if (score > 25) {
      candidates.push({ element: el, score });
    }
  }

  if (candidates.length === 0) {
    return root;
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // If the best candidate is wrapped by an article or main with similar text, prefer the higher semantic container
  const parentArticle = best.element.closest('article, main');
  if (parentArticle && getLinkDensity(parentArticle) < 0.3) {
    return parentArticle;
  }

  return best.element;
}

// ============================================================================
// 4. Universal Image Normalization
// ============================================================================

/**
 * Universal normalization of all remote images in content container:
 * Resolves lazy-loaded attributes (zoomfile, file, data-src, etc.),
 * ignores placeholders, converts relative URLs to absolute, and returns unique images.
 */
export function normalizeUniversalImages(container: Element, baseUrl: string): string[] {
  const images: string[] = [];

  container.querySelectorAll('img').forEach((img) => {
    const rawSrc = getEffectiveImgSrc(img);
    if (rawSrc && !isPlaceholderImage(rawSrc)) {
      const resolved = resolveUrl(rawSrc, baseUrl);
      img.setAttribute('src', resolved);
      if (!resolved.startsWith('data:') && !images.includes(resolved)) {
        images.push(resolved);
      }
    } else {
      img.remove();
    }
  });

  return images;
}

// ============================================================================
// 5. High-level Universal Web Extraction Pipeline
// ============================================================================

export function extractArticleFromDocument(doc: Document, url: string): ExtractedArticle {
  // 1. Extract metadata
  const metadata = extractUniversalMetadata(doc, url);

  // 2. Clone body to ensure metadata extraction is isolated
  const bodyClone = (doc.body || doc.documentElement).cloneNode(true) as Element;

  // 3. Pre-clean noise & anti-crawler watermarks
  sanitizeDocument(bodyClone);

  // 4. Score and locate primary article content element
  const contentEl = scoreAndSelectArticleElement(bodyClone);

  // 5. Universal image resolution & normalization
  const images = normalizeUniversalImages(contentEl, url);

  // 6. Convert to Markdown
  let bodyMarkdown = convertHtmlToMarkdown(contentEl, { baseUrl: url }).trim();

  // 7. Compose Markdown with clean metadata header
  const metaParts: string[] = [];
  if (metadata.author) metaParts.push(`**作者**：${metadata.author}`);
  if (metadata.publishDate) metaParts.push(`**发布时间**：${metadata.publishDate}`);
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
  if (metadata.title && !bodyMarkdown.startsWith('# ')) {
    markdown = metaHeader ? `# ${metadata.title}\n\n${metaHeader}\n\n${bodyMarkdown}` : `# ${metadata.title}\n\n${bodyMarkdown}`;
  } else {
    markdown = metaHeader ? `${metaHeader}\n\n${bodyMarkdown}` : bodyMarkdown;
  }

  return {
    metadata,
    markdown,
    images,
  };
}
