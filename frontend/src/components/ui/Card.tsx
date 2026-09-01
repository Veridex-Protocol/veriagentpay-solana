import React from 'react';
import { clsx } from 'clsx';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  glow = false,
  className,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'glass-panel va-product-surface rounded-2xl p-5 relative overflow-hidden',
        hoverable && 'glass-panel-hover cursor-pointer',
        glow && 'border-[#F2D827]/30 shadow-glow',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
