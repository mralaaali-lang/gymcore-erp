---
name: Gimawi Premium Athlete
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#584237'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#8c7164'
  outline-variant: '#e0c0b1'
  surface-tint: '#9d4300'
  primary: '#9d4300'
  on-primary: '#ffffff'
  primary-container: '#f97316'
  on-primary-container: '#582200'
  inverse-primary: '#ffb690'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#b91a24'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff6a64'
  on-tertiary-container: '#6c000b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbca'
  primary-fixed-dim: '#ffb690'
  on-primary-fixed: '#341100'
  on-primary-fixed-variant: '#783200'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  headline-xl:
    fontFamily: beVietnamPro
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: beVietnamPro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: beVietnamPro
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: beVietnamPro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: beVietnamPro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: beVietnamPro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: beVietnamPro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  caption:
    fontFamily: beVietnamPro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1440px
  gutter: 1.5rem
  margin-mobile: 1rem
  margin-desktop: 2.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style
The design system embodies a premium, high-energy, yet professional atmosphere tailored for gym management and athletic excellence. It targets gym owners and administrators who require a tool that feels as functional as it is inspiring. 

The aesthetic is **Corporate Modern with Tactile Accents**, utilizing heavy whitespace to ensure clarity in data-dense management screens while using vibrant orange accents to drive action and momentum. The emotional response should be one of confidence, cleanliness, and athletic vigor. The interface remains "invisible" through minimalist structures, allowing the data and user actions to lead.

## Colors
This design system utilizes a high-contrast palette to distinguish between navigation, information, and action.

- **Primary (Vibrant Orange):** Reserved for primary call-to-action buttons, active navigation states, and focus indicators.
- **Success (Emerald Green):** Used for "Active" membership statuses, payment confirmations, and positive growth metrics.
- **Alert (Crimson Red):** Specifically designated for expired memberships, outstanding debts, and critical system warnings.
- **Neutrals:** Dark Charcoal provides maximum legibility for body text, while Very Light Gray is used for structural borders to maintain a "frameless" look.

## Typography
The system uses **beVietnamPro** (representing a modern, clean substitute for professional Arabic-compatible sans-serif scales) to maintain a contemporary and approachable feel.

- **RTL Alignment:** All text is right-aligned by default.
- **Hierarchy:** Use `headline-xl` for dashboard summaries (e.g., total members). `label-md` is used for form headers and navigation items.
- **Weights:** Use Bold (700) sparingly for emphasis; Semi-Bold (600) is the standard for interactive elements like buttons and tabs.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for Right-to-Left (RTL) reading patterns. 

- **Sidebar:** The primary navigation resides on the right side of the screen.
- **Grid:** A 12-column grid is used for desktop, collapsing to 1 column for mobile.
- **Spacing Rhythm:** Use a baseline of 4px. Component internal padding should default to `1rem` (16px) for comfort.
- **Reflow:** On mobile, the right sidebar transforms into a bottom navigation bar or a right-aligned hamburger drawer.

## Elevation & Depth
To maintain a premium feel, the design system avoids heavy shadows, opting instead for **Ambient Depth**.

- **Level 0 (Base):** Pure White (#FFFFFF) background.
- **Level 1 (Cards):** Very Light Gray (#F3F4F6) 1px border. No shadow. Used for secondary content.
- **Level 2 (Floating):** Used for active cards and modals. A soft, diffused shadow: `0 10px 15px -3px rgba(0, 0, 0, 0.05)`.
- **Interactions:** When a user hovers over a membership card, the elevation increases slightly via a subtle orange glow or a more pronounced shadow to indicate interactivity.

## Shapes
The design system utilizes **Rounded (2xl)** geometry to soften the technical nature of a management system.

- **Standard Radius:** 0.5rem (8px) for small components like inputs.
- **Large Radius (2xl):** 1rem (16px) for main content containers, membership cards, and primary buttons.
- **Interactive Elements:** Ensure all focus states follow the curve of the container, maintaining a 2px offset for the orange focus ring.

## Components
Consistent styling across the application ensures a premium user experience.

- **Buttons:** Primary buttons use a solid Orange background with White text and `rounded-2xl`. Secondary buttons use a transparent background with an Orange border.
- **Input Fields:** Feature "Floating Labels" that shrink and move to the top-right border on focus. Focus state triggers a 2px Orange ring.
- **Sliding Tabs:** A custom component where the active state is a white "pill" that slides over a light gray track.
- **Cards:** Used for Member Profiles. They feature a 1px #F3F4F6 border and utilize the Emerald Green or Crimson Red for status indicators in the top-left corner (RTL inverse).
- **Chips:** Small, high-radius (pill) indicators for tags like "Monthly," "VIP," or "Yoga Class."
- **Interactive Progress:** Circular charts for gym capacity or revenue goals, using the Primary Orange for the progress fill.