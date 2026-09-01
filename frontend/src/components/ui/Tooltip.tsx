'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, disabled }) => {
  const [isVisible, setIsVisible] = useState(false);

  if (disabled) {
    return children;
  }

  // Clone children to inject focus/blur handlers for accessibility
  const trigger = React.cloneElement(children, {
    onFocus: (e: React.FocusEvent) => {
      setIsVisible(true);
      if (children.props.onFocus) children.props.onFocus(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setIsVisible(false);
      if (children.props.onBlur) children.props.onBlur(e);
    },
  });

  return (
    <div
      className="relative flex items-center justify-center w-full"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {trigger}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, x: -8, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-xl border border-white/[0.08] bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-glow backdrop-blur-md"
          >
            {content}
            {/* Left triangle pointer */}
            <div className="absolute top-1/2 -left-1 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-white/[0.08] bg-slate-950" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
