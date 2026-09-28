import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FAF8F4',
        paper: '#FFFFFF',
        wash: '#F4F1EB',
        sand: { 50: '#F8F4EC', 100: '#F1EADC', 200: '#E6DAC3', 300: '#D6C3A0', 400: '#C2A676', 500: '#B08D57', 600: '#95743F', 700: '#76592F' },
        line: { DEFAULT: '#E7E2D9', strong: '#D8D1C4' },
        ink: { DEFAULT: '#231D19', 2: '#4F4740', 3: '#7F766D', 4: '#A69E95' },
        st: {
          green: '#2E7A4E', greenBg: '#E5F1E9',
          blue: '#2D5C99', blueBg: '#E6EDF7',
          amber: '#9A6410', amberBg: '#FAEFD9',
          red: '#AE3527', redBg: '#F8E3E0',
          grey: '#655E57', greyBg: '#EEEAE4',
          neutral: '#8F887F', neutralBg: '#F3F1ED',
          violet: '#6446A0', violetBg: '#EEE8F7',
          teal: '#1F6F6B', tealBg: '#E1F0EF',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        drawer: '-12px 0 32px -12px rgba(35,29,25,0.18)',
        pop: '0 8px 28px -6px rgba(35,29,25,0.18), 0 0 0 1px rgba(35,29,25,0.06)',
      },
      keyframes: {
        slidein: { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        slidein: 'slidein 160ms ease-out',
        fadein: 'fadein 120ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
