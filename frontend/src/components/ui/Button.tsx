import React from 'react';
import { clsx } from 'clsx';
import { VeriAgentLogoMark } from './VeriAgentLoader';
import { motion } from 'framer-motion';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  onClick,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Trigger haptic vibration on mobile if available
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
    if (onClick && !disabled && !isLoading) {
      onClick(e);
    }
  };

  const variantStyles = {
    primary:
      'bg-[#F2D827] text-slate-950 font-bold hover:bg-[#E5A900] shadow-[0_8px_24px_-8px_rgba(242,216,39,0.35)]',
    secondary:
      'bg-white/[0.07] text-white hover:bg-white/[0.11] border border-white/10 light:bg-white light:text-slate-800 light:border-slate-300 light:hover:bg-slate-100',
    outline:
      'bg-transparent text-[#F2D827] border border-[#F2D827]/40 hover:bg-[#F2D827]/10',
    ghost:
      'bg-transparent text-slate-300 hover:text-white hover:bg-white/[0.06] light:text-slate-700 light:hover:text-slate-950 light:hover:bg-slate-100',
    danger:
      'bg-brand-danger/80 text-white hover:bg-brand-danger border border-brand-danger/40',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3.5 text-base rounded-2xl gap-2.5 font-bold',
  };

  const spinnerSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#F2D827]/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <VeriAgentLogoMark size={spinnerSize} speed="fast" withSquircle={false} glow={false} />
      ) : (
        <>
          {leftIcon}
          <span>{children}</span>
          {rightIcon}
        </>
      )}
    </motion.button>
  );
};
