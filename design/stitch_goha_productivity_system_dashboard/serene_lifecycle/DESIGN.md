---
name: Serene Lifecycle
colors:
  surface: '#faf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#faf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f2'
  surface-container: '#efeeec'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e1'
  on-surface: '#1b1c1b'
  on-surface-variant: '#424847'
  inverse-surface: '#303130'
  inverse-on-surface: '#f2f0ef'
  outline: '#727877'
  outline-variant: '#c2c8c6'
  surface-tint: '#4c635f'
  primary: '#4c635f'
  on-primary: '#ffffff'
  primary-container: '#8fa7a3'
  on-primary-container: '#273d3a'
  inverse-primary: '#b3ccc7'
  secondary: '#6a5c46'
  on-secondary: '#ffffff'
  secondary-container: '#f3e0c3'
  on-secondary-container: '#71624c'
  tertiary: '#5c5b7a'
  on-tertiary: '#ffffff'
  tertiary-container: '#a19fc1'
  on-tertiary-container: '#363652'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cfe8e3'
  primary-fixed-dim: '#b3ccc7'
  on-primary-fixed: '#081f1d'
  on-primary-fixed-variant: '#354b48'
  secondary-fixed: '#f3e0c3'
  secondary-fixed-dim: '#d6c4a8'
  on-secondary-fixed: '#241a08'
  on-secondary-fixed-variant: '#524530'
  tertiary-fixed: '#e2dfff'
  tertiary-fixed-dim: '#c5c3e6'
  on-tertiary-fixed: '#191933'
  on-tertiary-fixed-variant: '#454461'
  background: '#faf9f8'
  on-background: '#1b1c1b'
  surface-variant: '#e3e2e1'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '300'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-margin: 32px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 64px
---

## Brand & Style

The design system is anchored in a philosophy of "Intentional Calm." It is tailored for high-achieving individuals seeking a personal life dashboard that functions as a sanctuary rather than a source of cognitive load. The aesthetic merges **Minimalism** with a **Tactile** edge, utilizing soft depth and a whisper-thin information hierarchy to ensure the user feels in control and at peace.

The target audience values maturity, premium finishes, and quiet sophistication. The UI avoids the aggressive "gamification" of modern apps, opting instead for a "Zen-office" atmosphere where every element has room to breathe. The emotional response should be one of clarity, focus, and understated luxury.

## Colors

The palette is a sophisticated curation of desaturated earth tones. The primary background (#FAF8F3) provides a warm, paper-like foundation that reduces eye strain compared to pure white. 

- **Accents:** Use the Sage Blue-Green (#8FA7A3) as the rhythmic pulse of the interface—for primary actions and progress. The Beige and Lavender are reserved for categorization (e.g., distinguishing "Health" from "Finance") or subtle decorative elements.
- **Dark Mode:** Transitions to a deep charcoal environment. Surfaces use a slightly lighter grey (#222222) to establish depth, while the off-white text (#F5F2EC) maintains the "warm" signature of the design system.
- **Status:** Success, Warning, and Danger colors are muted to prevent them from breaking the "Calm" narrative. They should appear as organic tints rather than vibrant signals.

## Typography

The design system utilizes **Manrope** for its exceptional balance of modern geometry and humanistic warmth. 

- **Hierarchy:** Use the Display weight (300) for large, welcoming headers like personal greetings or date displays. 
- **Weights:** Medium (500) is used for section headers and Semibold (600) for labels to ensure legibility against the soft color palette. 
- **Spacing:** Apply slight negative letter-spacing to headlines for a premium, "tucked-in" feel, and slightly increased tracking for labels to enhance readability at small sizes.

## Layout & Spacing

This design system follows a **Fixed-Fluid hybrid grid**. On desktop, the content is centered within a 1280px max-width container to maintain focus. 

- **Rhythm:** An 8px base unit drives all spacing. 
- **Margins:** Generous 32px outer margins ensure the UI never feels cramped. 
- **Desktop:** 12-column grid with 24px gutters.
- **Tablet:** 8-column grid with 20px gutters.
- **Mobile:** 4-column grid with 16px gutters.
- **Philosophy:** Whitespace is treated as a first-class citizen. Use `section-gap` between major functional areas to create clear mental "rooms" for the user.

## Elevation & Depth

The design system employs **Tonal Layering** combined with **Ambient Shadows** to create a soft, paper-stack effect.

1.  **Level 0 (Background):** #FAF8F3.
2.  **Level 1 (Cards):** #FFFFFF. These use a 1px border (#E8E2D8) and a very soft, diffused shadow: `0 4px 20px rgba(143, 167, 163, 0.08)`. Note the shadow is slightly tinted with the primary sage color to maintain harmony.
3.  **Level 2 (Modals/Popovers):** Elevated with a more pronounced shadow: `0 12px 40px rgba(0, 0, 0, 0.05)`.

Avoid heavy black shadows. Depth should feel like natural morning light hitting cardstock.

## Shapes

The shape language is consistently **Rounded**, reflecting a soft and approachable personality. 

- **Cards & Primary Containers:** Use `rounded-lg` (16px) to create a friendly, "cradled" feel for content.
- **Buttons & Inputs:** Use a standard 8px radius to maintain a professional, organized structure.
- **Status Badges & Chips:** These can use the `rounded-xl` (24px) or full pill-shape to distinguish them from functional input elements.

## Components

- **Buttons:** Primary buttons use a solid Sage (#8FA7A3) background with white text. Secondary buttons use a transparent background with an 8px border in #E8E2D8 and Primary Text. 
- **Cards:** The core of the dashboard. Use white backgrounds, 16px corner radius, and the thin #E8E2D8 border. Header areas within cards should be separated by a subtle 1px horizontal line.
- **Input Fields:** Use a subtle background tint (#FAF8F3) and a 1px border. Focus states should transition the border to Sage (#8FA7A3) with a 2px outer soft glow.
- **Chips/Badges:** Small, pill-shaped indicators. Use light tints of the secondary and tertiary colors (e.g., 10% opacity Lavender) for the background and full saturation for the text.
- **Progress Bars:** Thin 4px tracks in #E8E2D8 with Sage or Success green fills.
- **Lists:** Use generous vertical padding (16px) between list items, separated by a light border-bottom to maintain the airy feel.