import React from 'react';
import { clsx } from 'clsx';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-xl bg-slate-800/60 border border-white/5 light:bg-slate-200 light:border-slate-300',
        className
      )}
      {...props}
    />
  );
};
