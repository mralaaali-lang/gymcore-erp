import { theme } from './src/styles/tailwind-tokens.js';

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
      colors,
      fontFamily,
      fontSize,
      borderRadius,
      spacing,
    },
  },
  plugins: [],
};
