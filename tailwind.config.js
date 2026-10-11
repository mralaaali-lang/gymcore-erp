import { theme } from './src/styles/tailwind-tokens.js';

const { colors, fontFamily, fontSize, borderRadius, spacing } = theme;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
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
