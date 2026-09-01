/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#F2D827',
          500: '#E5A900',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          950: '#422006',
        },
        teal: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#F2D827',
          500: '#E5A900',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          950: '#422006',
        },
        green: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#F2D827',
          500: '#E5A900',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          950: '#422006',
        },
        brand: {
          navy: '#0B0F19',
          darker: '#070A11',
          carbon: '#070A11',
          card: '#0F172A',
          cardHover: '#162033',
          inset: '#020617',
          border: 'rgba(255, 255, 255, 0.10)',
          borderYellow: 'rgba(242, 216, 39, 0.25)',
          yellow: '#F2D827',
          yellowHover: '#E5A900',
          yellowLight: 'rgba(242, 216, 39, 0.12)',
          // Backward compatibility mappings transitioning to yellow
          emerald: '#F2D827',
          emeraldHover: '#E5A900',
          emeraldLight: 'rgba(242, 216, 39, 0.12)',
          slate: '#F8FAFC',
          muted: '#94A3B8',
          accentPurple: '#F2D827',
          accentBlue: '#F2D827',
          amber: '#F59E0B',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Avenir Next', 'sans-serif'],
        mono: ['IBM Plex Mono', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 12px 40px -16px rgba(242, 216, 39, 0.35)',
        glowPurple: '0 12px 40px -16px rgba(242, 216, 39, 0.35)',
        panel: '0 24px 80px -48px rgba(0, 0, 0, 0.9)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [
    // The application uses explicit `light:*` utilities alongside Tailwind's
    // built-in `dark:*` variant. Without this variant those light-mode styles
    // are silently omitted from the generated stylesheet.
    function ({ addVariant }) {
      addVariant('light', '.light &');
    },
  ],
};
