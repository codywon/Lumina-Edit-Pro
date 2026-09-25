import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

type BrandIconSize = 'sm' | 'md' | 'lg';

interface BrandIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: BrandIconSize;
}

const containerSize: Record<BrandIconSize, string> = {
  sm: 'size-7 rounded-md',
  md: 'size-10 rounded-xl',
  lg: 'size-16 rounded-2xl',
};

const glyphSize: Record<BrandIconSize, number> = {
  sm: 16,
  md: 22,
  lg: 34,
};

export default function BrandIcon({
  size = 'sm',
  className,
  'aria-label': ariaLabel = 'Lumina Edit Pro 图标',
  ...props
}: BrandIconProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      data-brand-icon="lumina"
      className={cn(
        'flex items-center justify-center bg-accent text-white',
        containerSize[size],
        className
      )}
    >
      <Sparkles size={glyphSize[size]} className="text-white" />
    </div>
  );
}
