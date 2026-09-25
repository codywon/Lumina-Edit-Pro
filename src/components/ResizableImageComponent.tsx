import React, { useRef, useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ResizableImageComponent({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialWidthRef = useRef<number>(0);
  const startXRef = useRef<number>(0);

  const { src, alt, title, width, alignment = 'center' } = node.attrs;

  const handleMouseDown = (e: React.MouseEvent, handle: 'se' | 'sw') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const rect = containerRef.current?.getBoundingClientRect();
    initialWidthRef.current = rect?.width || 400;
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(120, Math.min(1200, handle === 'se' ? initialWidthRef.current + deltaX : initialWidthRef.current - deltaX));
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

  const alignmentClass =
    alignment === 'left'
      ? 'justify-start'
      : alignment === 'right'
      ? 'justify-end'
      : 'justify-center';

  return (
    <NodeViewWrapper className={cn("relative my-4 flex group select-none", alignmentClass)}>
      <div
        ref={containerRef}
        className={cn(
          "relative inline-block max-w-full rounded-xl transition-shadow",
          (selected || isResizing) && "ring-2 ring-accent ring-offset-2 dark:ring-offset-[#121212]"
        )}
        style={{ width: width || 'auto' }}
      >
        <img
          src={src}
          alt={alt || ''}
          title={title || ''}
          draggable={false}
          className="rounded-xl block max-w-full h-auto shadow-sm object-contain"
          style={{ width: '100%' }}
        />

        {/* Quick Toolbar on hover or select */}
        {(selected || isResizing) && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-lg text-[10px]">
            {/* Presets */}
            {['25%', '50%', '75%', '100%'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSetPresetWidth(p)}
                className={cn(
                  "px-1.5 py-0.5 rounded transition-colors",
                  width === p ? "bg-accent text-white font-bold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                )}
              >
                {p}
              </button>
            ))}

            <div className="h-3 w-px bg-slate-200 dark:bg-white/10 mx-1" />

            {/* Alignments */}
            <button
              type="button"
              onClick={() => handleSetAlignment('left')}
              className={cn("p-1 rounded", alignment === 'left' ? "text-accent bg-accent-soft" : "text-slate-400 hover:text-slate-700")}
              title="居左对齐"
            >
              <AlignLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('center')}
              className={cn("p-1 rounded", alignment === 'center' ? "text-accent bg-accent-soft" : "text-slate-400 hover:text-slate-700")}
              title="居中对齐"
            >
              <AlignCenter size={12} />
            </button>
            <button
              type="button"
              onClick={() => handleSetAlignment('right')}
              className={cn("p-1 rounded", alignment === 'right' ? "text-accent bg-accent-soft" : "text-slate-400 hover:text-slate-700")}
              title="居右对齐"
            >
              <AlignRight size={12} />
            </button>

            <div className="h-3 w-px bg-slate-200 dark:bg-white/10 mx-1" />

            {/* Delete */}
            <button
              type="button"
              onClick={deleteNode}
              className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              title="删除图片"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}

        {/* Bottom-right Corner Drag Handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'se')}
          className={cn(
            "absolute -bottom-1.5 -right-1.5 size-3.5 rounded-full bg-white border-2 border-accent shadow-md cursor-se-resize transition-transform",
            (selected || isResizing) ? "scale-100 opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:scale-100"
          )}
          title="拖拽缩放图片大小"
        />

        {/* Bottom-left Corner Drag Handle */}
        <div
          onMouseDown={(e) => handleMouseDown(e, 'sw')}
          className={cn(
            "absolute -bottom-1.5 -left-1.5 size-3.5 rounded-full bg-white border-2 border-accent shadow-md cursor-sw-resize transition-transform",
            (selected || isResizing) ? "scale-100 opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:scale-100"
          )}
          title="拖拽缩放图片大小"
        />
      </div>
    </NodeViewWrapper>
  );
}
