/**
 * CJK & English Spacing Formatter
 * Automatically inserts a breathing space between CJK characters and Latin/numbers/symbols.
 * e.g., "用Python编写Markdown" -> "用 Python 编写 Markdown"
 */
export function formatPanguSpacing(text: string): string {
  if (!text) return '';

  return text
    // CJK and English/Number
    .replace(/([\u4e00-\u9fa5\u3040-\u30ff])([a-zA-Z0-9])/g, '$1 $2')
    .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5\u3040-\u30ff])/g, '$1 $2')
    // CJK and common inline symbols (% & + = < >)
    .replace(/([\u4e00-\u9fa5\u3040-\u30ff])([%&+=<>])/g, '$1 $2')
    .replace(/([%&+=<>])([\u4e00-\u9fa5\u3040-\u30ff])/g, '$1 $2');
}

/**
 * Unicode punctuation (`\p{P}`) + symbol (`\p{S}`) — exactly the character classes that
 * CommonMark 0.30 §6.2 uses to decide whether a `*` run may open or close emphasis.
 */
const EMPHASIS_PUNCTUATION = /[\p{P}\p{S}]/u;
const EMPHASIS_SPACE = /[\s\u3000]/;
/** Inline code spans are masked with this symbol char while delimiter flanking is evaluated. */
const CODE_SPAN_PLACEHOLDER = '\uFFFC';

function isEmphasisPunctuation(char: string | undefined): boolean {
  return char !== undefined && EMPHASIS_PUNCTUATION.test(char);
}

function isEmphasisSpace(char: string | undefined): boolean {
  return char !== undefined && EMPHASIS_SPACE.test(char);
}

interface EmphasisPair {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

/**
 * Pairs up `**` delimiter runs on a single line (greedy, left to right).
 * Runs longer/shorter than exactly two stars (`*`, `***`) are never touched, so literal
 * asterisks, bullet list markers and bold-italic combinations stay untouched.
 */
function findEmphasisPairs(line: string): EmphasisPair[] {
  const pairs: EmphasisPair[] = [];
  const runs = /\*+/g;
  let pending: { start: number; end: number } | null = null;
  let match: RegExpExecArray | null;

  while ((match = runs.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (match[0].length !== 2) {
      pending = null;
      continue;
    }
    if (!pending) {
      pending = { start, end };
      continue;
    }
    // An empty (or blank-only) pair is never emphasis — treat the current run as the new opener.
    if (line.slice(pending.end, start).trim().length === 0) {
      pending = { start, end };
      continue;
    }

    pairs.push({ openStart: pending.start, openEnd: pending.end, closeStart: start, closeEnd: end });
    pending = null;
  }

  return pairs;
}

/**
 * Repairs the flanking conditions of an already paired `**bold**` span.
 *
 * - `**` immediately followed by whitespace can never open  → drop the inner left padding
 * - `**` immediately preceded by whitespace can never close → drop the inner right padding
 * - opener followed by punctuation, but preceded by plain text (`的**"…"**`) → insert one space
 *   before it, because CommonMark requires the delimiter to sit after whitespace/punctuation
 * - closer preceded by punctuation, but followed by plain text (`**工具：**查环境`) → insert one
 *   space after it, same reason
 *
 * Everything else is left byte-identical, so ordinary bold text is never rewritten.
 */
function repairLineEmphasis(line: string): string {
  const pairs = findEmphasisPairs(line);
  if (pairs.length === 0) return line;

  const edits: { start: number; end: number; insert: string }[] = [];

  for (const pair of pairs) {
    let innerStart = pair.openEnd;
    let innerEnd = pair.closeStart;

    const leadingPadding = /^[ \t\u3000]+/.exec(line.slice(innerStart, innerEnd));
    if (leadingPadding) {
      edits.push({ start: innerStart, end: innerStart + leadingPadding[0].length, insert: '' });
      innerStart += leadingPadding[0].length;
    }

    const trailingPadding = /[ \t\u3000]+$/.exec(line.slice(innerStart, innerEnd));
    if (trailingPadding) {
      edits.push({ start: innerEnd - trailingPadding[0].length, end: innerEnd, insert: '' });
      innerEnd -= trailingPadding[0].length;
    }

    if (innerEnd <= innerStart) continue;

    const charBeforeOpen = pair.openStart > 0 ? line[pair.openStart - 1] : undefined;
    if (
      isEmphasisPunctuation(line[innerStart]) &&
      charBeforeOpen !== undefined &&
      !isEmphasisSpace(charBeforeOpen) &&
      !isEmphasisPunctuation(charBeforeOpen)
    ) {
      edits.push({ start: pair.openStart, end: pair.openStart, insert: ' ' });
    }

    const charAfterClose = pair.closeEnd < line.length ? line[pair.closeEnd] : undefined;
    if (
      isEmphasisPunctuation(line[innerEnd - 1]) &&
      charAfterClose !== undefined &&
      !isEmphasisSpace(charAfterClose) &&
      !isEmphasisPunctuation(charAfterClose)
    ) {
      edits.push({ start: pair.closeEnd, end: pair.closeEnd, insert: ' ' });
    }
  }

  if (edits.length === 0) return line;

  // Apply right-to-left so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let repaired = line;
  for (const edit of edits) {
    repaired = repaired.slice(0, edit.start) + edit.insert + repaired.slice(edit.end);
  }
  return repaired;
}

/** Masks inline code spans (their punctuation still counts, their text is never rewritten). */
function normalizeEmphasisInLine(line: string): string {
  if (!line.includes('**')) return line;

  const codeSpans: string[] = [];
  const masked = line.replace(/`+[^`\n]*?`+/g, (span) => {
    codeSpans.push(span);
    return CODE_SPAN_PLACEHOLDER;
  });

  const repaired = repairLineEmphasis(masked);
  if (repaired === masked) return line;
  if (codeSpans.length === 0) return repaired;

  let cursor = 0;
  return repaired.replace(/\uFFFC/g, () => codeSpans[cursor++] ?? CODE_SPAN_PLACEHOLDER);
}

/**
 * Normalizes CJK emphasis delimiters so CommonMark parsers (markdown-it / marked / remark)
 * render them as real bold instead of leaking raw `**` into the document.
 *
 * CommonMark only opens an emphasis run when the `**` is "left-flanking" and only closes it when
 * the second run is "right-flanking" (CommonMark 0.30 §6.2). Chinese writing breaks both rules
 * constantly, because punctuation touches the delimiters with no space in between:
 *
 * - `这是**"引号"**的内容`        → opener followed by punctuation (never opens)
 * - `**13 个工具：**查环境`        → closer preceded by `：` then followed by a CJK char
 * - `甲**（备注）**乙` / `甲**`code`**乙` → punctuation (or a code span) hugging both delimiters
 * - `甲** 备注 **乙`               → padding whitespace inside the delimiters
 *
 * Fenced (` ``` `/`~~~`) and indented code blocks, plus inline code spans, are left untouched.
 */
export function normalizeCjkEmphasis(markdown: string): string {
  if (!markdown || !markdown.includes('**')) return markdown;

  const lines = markdown.split('\n');
  let fenceMarker: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

    if (fenceMarker) {
      if (fence && fence[1][0] === fenceMarker[0] && fence[1].length >= fenceMarker.length) {
        fenceMarker = null;
      }
      continue;
    }
    if (fence) {
      fenceMarker = fence[1];
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) continue; // indented code block
    lines[i] = normalizeEmphasisInLine(line);
  }

  return lines.join('\n');
}
