import React, { useMemo } from 'react';
import { Type, Clock } from 'lucide-react';

function FooterComponent({ content, showToast }: { content: string, showToast: (msg: string, level?: 'info' | 'warning' | 'error') => void }) {
  const { charCount, totalWords, readingTimeMin } = useMemo(() => {
    const charCount = content.length;
    let chineseChars = 0;
    let englishWords = 0;
    let inWord = false;

    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code >= 0x4e00 && code <= 0x9fa5) {
        chineseChars++;
        if (inWord) inWord = false;
      } else if (
        (code >= 65 && code <= 90) || // A-Z
        (code >= 97 && code <= 122) || // a-z
        (code >= 48 && code <= 57) || // 0-9
        code === 95 // _
      ) {
        if (!inWord) {
          inWord = true;
          englishWords++;
        }
      } else {
        inWord = false;
      }
    }

    const totalWords = chineseChars + englishWords;
    const readingTimeMin = Math.max(1, Math.ceil(totalWords / 300));
    return { charCount, totalWords, readingTimeMin };
  }, [content]);

  return (
    <footer className="h-7 shrink-0 flex items-center justify-between border-t border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#0E0E11] px-4 text-[10px] text-slate-500 z-20 transition-colors duration-200 select-none">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5" title="字符总数 / 词总数">
          <Type size={12} />
          {`${charCount.toLocaleString()} 字符 / ${totalWords.toLocaleString()} 词`}
        </span>
        <span className="flex items-center gap-1.5" title="预估阅读时间（按 300 词/分钟计算）">
          <Clock size={12} />
          {`约 ${readingTimeMin} 分钟阅读`}
        </span>
        <span className="text-accent font-semibold ml-2">UTF-8</span>
      </div>
      
      <div className="flex items-center gap-4">
        <button onClick={() => showToast('Markdown 实时解析模式', 'info')} className="hover:text-slate-900 dark:hover:text-white transition-colors">Markdown</button>
      </div>
    </footer>
  );
}

export default React.memo(FooterComponent);


