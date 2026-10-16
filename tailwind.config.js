import animate from 'tailwindcss-animate';
import { theme } from './src/styles/tailwind-tokens.js';
import { shadcnColors } from './src/styles/shadcn-colors.js';

const { colors, fontFamily, fontSize, borderRadius, spacing } = theme;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    // Mobile-first breakpoints (Bootstrap-aligned + small-phone tiers).
    // Replaces Tailwind defaults: sm 640→576, lg 1024→992, xl 1280→1200,
    // 2xl 1536→1400. md stays 768. xs/ss are new small-phone tiers.
    screens: {
      xs: '400px',
      ss: '500px',
      sm: '576px',
      md: '768px',
      lg: '992px',
      xl: '1200px',
      '2xl': '1400px',
    },
    extend: {
      // shadcnColors last: its four overlapping keys (background, primary,
      // secondary, accent) re-point at CSS variables holding identical values.
      colors: { ...colors, ...shadcnColors },
      fontFamily,
      fontSize,
      borderRadius,
      spacing,
      borderColor: { DEFAULT: 'hsl(var(--border))' },
      ringColor: { DEFAULT: 'hsl(var(--ring))' },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};
