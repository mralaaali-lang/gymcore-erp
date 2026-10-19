export const theme = {
  // ── Legacy MD3-era palette (historical) ──
  // The NAMES stay because ~75 call sites use them. The VALUES below are now
  // unreachable for the shell names (`background, card, surface*, on-surface*,
  // inverse-*, outline*`): `shadcn-colors.js` is spread AFTER this object in
  // tailwind.config.js and re-points each one at a `tokens.css` variable, so
  // Chalk & Brass is retinted there, not here. Do not add a colour here —
  // add a variable in tokens.css and a one-line re-point in shadcn-colors.js.
  colors: {
    surface: '#f9fafb',
    'surface-dim': '#e5e7eb',
    'surface-bright': '#f9fafb',
    'surface-container-lowest': '#ffffff',
    'surface-container-low': '#f9fafb',
    'surface-container': '#f3f4f6',
    'surface-container-high': '#e5e7eb',
    'surface-container-highest': '#d1d5db',
    'on-surface': '#111827',
    'on-surface-variant': '#6b7280',
    'inverse-surface': '#111827',
    'inverse-on-surface': '#f9fafb',
    outline: '#d1d5db',
    'outline-variant': '#e5e7eb',
    card: '#ffffff',
    'surface-tint': '#10b981',
    // Petrol is themed: the ramp lives in tokens.css so dark mode can move the
    // top bar and the header ink onto the console navy. Same hexes in light.
    petrol: 'hsl(var(--petrol) / <alpha-value>)',
    'petrol-dark': 'hsl(var(--petrol-dark) / <alpha-value>)',
    'petrol-light': 'hsl(var(--petrol-light) / <alpha-value>)',
    'petrol-muted': 'hsl(var(--petrol-muted) / <alpha-value>)',
    accent: '#10b981',
    'on-accent': '#ffffff',
    'accent-glow': 'rgba(16, 185, 129, 0.35)',
    primary: '#10b981',
    'on-primary': '#ffffff',
    'primary-container': '#d1fae5',
    'on-primary-container': '#065f46',
    'inverse-primary': '#6ee7b7',
    secondary: '#006c49',
    'on-secondary': '#ffffff',
    'secondary-container': '#6cf8bb',
    'on-secondary-container': '#00714d',
    tertiary: '#b91a24',
    'on-tertiary': '#ffffff',
    'tertiary-container': '#ff6a64',
    'on-tertiary-container': '#6c000b',
    error: '#ba1a1a',
    'on-error': '#ffffff',
    'error-container': '#ffdad6',
    'on-error-container': '#93000a',
    'primary-fixed': '#ffdbca',
    'primary-fixed-dim': '#ffb690',
    'on-primary-fixed': '#341100',
    'on-primary-fixed-variant': '#783200',
    'secondary-fixed': '#6ffbbe',
    'secondary-fixed-dim': '#4edea3',
    'on-secondary-fixed': '#002113',
    'on-secondary-fixed-variant': '#005236',
    'tertiary-fixed': '#ffdad7',
    'tertiary-fixed-dim': '#ffb3ad',
    'on-tertiary-fixed': '#410004',
    'on-tertiary-fixed-variant': '#930013',
    background: '#f8f9ff',
    'on-background': '#121c2a',
    'surface-variant': '#d9e3f6',
    // Obsidian dark-mode palette for luxury athletic dashboards
    obsidian: {
      950: '#070a0f',
      900: '#0b0f17',
      850: '#0f1420',
      800: '#141b2b',
      700: '#1e293b',
    },
  },
  fontFamily: {
    // Only two keys, and both start with the SELF-HOSTED face. A `sans` key here
    // would also feed Tailwind preflight's `html` font-family, and an `arabic`
    // key would generate a `.font-arabic` utility that fights the hand-written
    // rule in index.css — both were added by the typography experiment and both
    // made the app depend on Google Fonts for its primary text.
    body: ['Be Vietnam Pro', 'sans-serif'],
    headline: ['Be Vietnam Pro', 'sans-serif'],
  },
  fontSize: {
    'headline-xl': ['40px', { lineHeight: '52px', fontWeight: '700', letterSpacing: '-0.02em' }],
    'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
    'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
    'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
    'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
    'label-md': ['14px', { lineHeight: '20px', fontWeight: '600', letterSpacing: '0.01em' }],
    caption: ['12px', { lineHeight: '16px', fontWeight: '500' }],
  },
  borderRadius: {
    DEFAULT: '0.5rem',
    lg: '1rem',
    xl: '1.5rem',
    full: '9999px',
    // Reads --radius from tokens.css (10px = Chalk & Brass, 2px = Score Sheet,
    // 18px = Thermal Clay) so the shell radius is one token change, not a codemod.
    shell: 'var(--radius)',
  },
  spacing: {
    'container-max': '1440px',
    gutter: '1.5rem',
    'margin-mobile': '1rem',
    'margin-desktop': '2.5rem',
    'stack-sm': '0.5rem',
    'stack-md': '1rem',
    'stack-lg': '2rem',
  },
};
