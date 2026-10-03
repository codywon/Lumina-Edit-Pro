import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { resolveImageSrc, readLocalImageBase64 } from '../lib/imageResolver';
import { isTauriRuntime } from '../services/native';

export default function ResizableImageComponent({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const initialWidthRef = useRef<number>(0);
  const startXRef = useRef<number>(0);

  const { src, alt, title, width, alignment } = node.attrs;

  const [displaySrc, setDisplaySrc] = useState<string>(() => resolveImageSrc(src));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncSrc = async () => {
      setHasError(false);

      if (
        !src ||
        src.startsWith('data:') ||
        src.startsWith('blob:') ||
        src.startsWith('http://') ||
        src.startsWith('https://')
      ) {
        setDisplaySrc(src || '');
        return;
      }

      // In Tauri desktop, immediately read local asset directly via Rust binary reader
      if (isTauriRuntime()) {
        try {
          const base64 = await readLocalImageBase64(src);
          if (base64 && isMounted) {
            setDisplaySrc(base64);
            setHasError(false);
            return;
          }
        } catch {
          // fall through to convertFileSrc
        }
      }

      const resolved = resolveImageSrc(src);
      if (isMounted) {
        setDisplaySrc(resolved);
      }
    };

    void syncSrc();

    const handleDocChanged = () => {
      void syncSrc();
    };

    window.addEventListener('lumina:document-path-changed', handleDocChanged);
    return () => {
      isMounted = false;
      window.removeEventListener('lumina:document-path-changed', handleDocChanged);
    };
  }, [src]);

  const handleImageError = async () => {
    if (!displaySrc.startsWith('data:')) {
      const fallbackDataUrl = await readLocalImageBase64(src);
      if (fallbackDataUrl) {
        setDisplaySrc(fallbackDataUrl);
        setHasError(false);
        return;
      }
    }
    setHasError(true);
  };

  const formattedWidth = width
    ? isNaN(Number(width))
      ? width
      : `${width}px`
    : 'auto';

  const handleMouseDown = (e: React.MouseEvent, handle: 'se' | 'sw') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const rect = containerRef.current?.getBoundingClientRect();
    initialWidthRef.current = rect?.width || 300;
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(
        48,
        Math.min(
          1200,
          handle === 'se'
            ? initialWidthRef.current + deltaX
            : initialWidthRef.current - deltaX
        )
      );
      updateAttributes({ width: `${Math.round(newWidth)}px` });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSetPresetWidth = (preset: string) => {
    updateAttributes({ width: preset });
  };

  const handleSetAlignment = (align: 'left' | 'center' | 'right') => {
    updateAttributes({ alignment: align });
  };

  return (
    <NodeViewWrapper
      as="span"
      data-align={alignment || undefined}
      className="relative inline-block align-middle mx-0.5 my-1 max-w-full select-none"
      style={{ width: formattedWidth }}
    >
      <span
        ref={containerRef}
        className={cn(
          "relative inline-block max-w-full transition-shadow",
          (selected || isResizing) && "ring-2 ring-accent ring-offset-2 dark:ring-offset-[#121212] rounded-sm"
        )}
        style={{ width: formattedWidth === 'auto' ? undefined : '100%' }}
      >
        {hasError ? (
          <span className="flex items-center gap-1.5 px-3 py-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 text-xs my-1">
            <ImageIcon className="w-4 h-4 text-neutral-400 shrink-0" />
            <span>无法加载图片: {alt || src}</span>
          </span>
        ) : (
          <img
            src={displaySrc}
            alt={alt || ''}
            title={title || ''}
            draggable={false}
            onError={handleImageError}
            className="inline-block align-middle max-w-full h-auto object-contain rounded"
            style={{ width: formattedWidth === 'auto' ? undefined : '100%' }}
          />
        )}

        {/* Quick Toolbar ONLY when explicitly selected or resizing */}
        {(selected || isResizing) && (
          <span className="print-hide absolute -top-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-lg text-[10px] whitespace-nowrap">
            {['25%', '50%', '75%', '100%'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSetPresetWidth(p)}
                className={cn(
                  "px-1.5 py-0.5 rounded transition-colors",
                  width === p
                    ? "bg-accent text-white font-bold"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                )}
              >
                {p}
              </button>
            ))}

            <span className="h-3 w-px bg-slate-200 dark:bg-white/10 mx-1" />

            <button
              type="button"
              onClick={() => handleSetAlignment('left')}
              className={cn(
                "p-1 rounded",
                alignment === 'left'
                  ? "text-accent bg-accent-soft"
                  : "text-slate-400 hover:text-slate-700"
              )}
              title="居左对齐"
            >
              <AlignLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('center')}
              className={cn(
                "p-1 rounded",
                alignment === 'center'
                  ? "text-accent bg-accent-soft"
                  : "text-slate-400 hover:text-slate-700"
              )}
              title="居中对齐"
            >
              <AlignCenter size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('right')}
              className={cn(
                "p-1 rounded",
                alignment === 'right'
                  ? "text-accent bg-accent-soft"
                  : "text-slate-400 hover:text-slate-700"
              )}
              title="居右对齐"
            >
              <AlignRight size={12} />
            </button>

            <span className="h-3 w-px bg-slate-200 dark:bg-white/10 mx-1" />

            <button
              type="button"
              onClick={deleteNode}
              className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              title="删除图片"
            >
              <Trash2 size={12} />
            </button>
          </span>
        )}

        {/* Corner Drag Handles ONLY when selected or resizing (never on hover!) */}
        {(selected || isResizing) && (
          <>
            <span
              onMouseDown={(e) => handleMouseDown(e, 'se')}
              className="print-hide absolute -bottom-1.5 -right-1.5 size-3.5 rounded-full bg-white border-2 border-accent shadow-md cursor-se-resize z-30"
              title="拖拽缩放图片大小"
            />
            <span
              onMouseDown={(e) => handleMouseDown(e, 'sw')}
              className="print-hide absolute -bottom-1.5 -left-1.5 size-3.5 rounded-full bg-white border-2 border-accent shadow-md cursor-sw-resize z-30"
              title="拖拽缩放图片大小"
            />
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
}
