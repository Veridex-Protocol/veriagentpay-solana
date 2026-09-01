import React from 'react';

export interface TokenIconProps {
  symbol: string;
  size?: number;
}

export const TokenIcon: React.FC<TokenIconProps> = ({ symbol, size = 28 }) => {
  const sym = symbol.toUpperCase();

  if (sym === 'USDC') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path
          d="M16 6C10.477 6 6 10.477 6 16C6 21.523 10.477 26 16 26C21.523 26 26 21.523 26 16C26 10.477 21.523 6 16 6ZM17.5 22H14.5V20.8A4.95 4.95 0 0 1 11.5 19L13 17.2A3.2 3.2 0 0 0 15 18.2C16 18.2 16.6 17.7 16.6 17C16.6 16.2 15.6 15.9 14.2 15.5C12.2 14.9 11.2 14.1 11.2 12.4C11.2 10.8 12.6 9.7 14.5 9.3V8H17.5V9.2A4.95 4.95 0 0 1 20.2 10.8L18.6 12.6A3.2 3.2 0 0 0 16.8 11.8C15.8 11.8 15.3 12.3 15.3 12.9C15.3 13.6 16.2 13.9 17.7 14.3C19.7 14.9 20.8 15.7 20.8 17.5C20.8 19.3 19.3 20.4 17.5 20.8V22Z"
          fill="white"
        />
      </svg>
    );
  }

  if (sym === 'USDT') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path
          d="M17.9 16.5V13.8H23V10.2H9V13.8H14.1V16.5C10.7 16.7 8 17.6 8 18.7C8 20 11.6 21 16 21C20.4 21 24 20 24 18.7C24 17.6 21.3 16.7 17.9 16.5ZM16 19.6C12.9 19.6 10.4 18.9 10.4 18.1C10.4 17.3 12.9 16.6 16 16.6C19.1 16.6 21.6 17.3 21.6 18.1C21.6 18.9 19.1 19.6 16 19.6Z"
          fill="white"
        />
      </svg>
    );
  }

  if (sym === 'BOT' || sym === 'VERI') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#F2D827" />
        <path
          d="M9 16L14 21L23 11"
          stroke="#000000"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center border border-white/10 shrink-0"
    >
      {sym.substring(0, 3)}
    </div>
  );
};
