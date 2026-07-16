# GoHa Design Spec: Apple HIG / Liquid Glass

Full Apple direction. Cool grays, SF-style typography, Liquid Glass materials, Apple spring physics. This document contains exact numbers, not adjectives. Every value is a decision.

This spec **replaces** the previous Amie "Warm Instrument" direction entirely. Discard the warm palette.

---

## 0. Honesty note on provenance

**Observed and verifiable:** Liquid Glass was announced at WWDC 2025 and ships in iOS 26, iPadOS 26, macOS Tahoe 26, tvOS 26, visionOS 26, and watchOS 26. It is a dynamic material system, not a visual skin, combining translucency, refraction, depth, and motion responsiveness while adapting to content. It behaves as a functional layer that expands, shrinks, and morphs on interaction. Its purpose is hierarchy and focus: content stays primary, interface controls recede. At WWDC 2026 Apple revised it for iOS 27 and macOS 27, reducing default transparency, changing sidebar corner radii, and adding a user slider between clearer and more tinted glass. Apple-mandated HIG rules: 44x44pt minimum tap target; text on solid layers, never directly on glass; one primary glass sheet per view; respect Reduce Transparency and Reduce Motion.

**Approximations, community-measured, not Apple-official:** all system color hex values below. Apple ships adaptive system colors, never fixed hex.

**Convention, not an Apple rule:** the 8pt grid with 4pt subdivisions. Designers reverse-engineer Apple's output to this and it is a reliable working model, but Apple's HIG does not mandate it the way Material Design does.

**My decisions:** the desktop type scale adaptation, all component metrics, the glass tier values, the spring parameters, and the proximity law.

---

## 1. Licensing reality (read before building)

- **SF Pro cannot be used.** Apple licenses it for designing and developing apps for Apple platforms only. A web app is not that.
- **SF Symbols cannot be used.** Same restriction.
- **Substitutes:** Inter v4 (variable, with the `opsz` optical sizing axis) for UI type. lucide-react for icons.
- Do not attempt to self-host SF Pro. Do not pull it from a CDN mirror.

---

## 2. The desktop adaptation (important)

Apple's published iOS metrics use a 17pt body. That is a touch-first phone metric and it is far too large for a desktop web app; it will look like a mobile app stretched onto a monitor. macOS uses roughly a 13pt body, which is small for the web.

**Decision: lean macOS, nudge up for web legibility. Body is 14px.** The scale below is adapted, not copied. This is the single most important adaptation in this document.

---

## 3. Typography

**UI font:** Inter v4 (variable), loaded via `next/font`.
**Mono:** Geist Mono, for timers, durations, counts.

Required settings:
```css
font-family: Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
font-feature-settings: "cv11", "ss01", "calt";
font-optical-sizing: auto;
```
`font-optical-sizing: auto` is non-negotiable. Inter v4's `opsz` axis reproduces the SF Pro Display / SF Pro Text crossover at 20pt, one of the strongest Apple signatures. Without it, Inter reads generic.

Add `font-variant-numeric: tabular-nums;` on every element showing numbers, counts, dates, durations, or progress.

### Type scale

Apple tightens tracking as size increases and loosens it at small sizes. This is a real signature. Apply exactly.

| Token | Size / Line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `large-title` | 34 / 40 | 700 | -0.022em | Focus timer, login hero |
| `title-1` | 28 / 34 | 700 | -0.020em | Cinematic moments |
| `title-2` | 22 / 28 | 600 | -0.015em | Page titles |
| `title-3` | 17 / 22 | 600 | -0.010em | Section headers |
| `headline` | 15 / 20 | 600 | -0.005em | Card titles, emphasized rows |
| `body` | 14 / 20 | 400 | -0.003em | Task titles, default text |
| `callout` | 13 / 18 | 400 | 0 | Secondary content |
| `subhead` | 12 / 16 | 500 | 0 | Labels, metadata |
| `footnote` | 11 / 14 | 500 | +0.005em | Timestamps, counts |
| `caption` | 11 / 13 | 600 | +0.050em | Uppercase eyebrows |

Never more than three sizes on one screen. Hierarchy comes from weight and label opacity first, size last.

---

## 4. Color

Cool grays. Apple's system palette. All values approximate and community-measured.

### The label opacity system

This is the Apple detail most implementations miss. **Labels are semi-transparent, not solid gray.** They adapt to whatever surface is beneath them. Implement as rgba, not hex grays.

**Light:**
| Token | Value |
|---|---|
| `label` | `#000000` |
| `label-secondary` | `rgba(60, 60, 67, 0.60)` |
| `label-tertiary` | `rgba(60, 60, 67, 0.30)` |
| `label-quaternary` | `rgba(60, 60, 67, 0.18)` |

**Dark:**
| Token | Value |
|---|---|
| `label` | `#FFFFFF` |
| `label-secondary` | `rgba(235, 235, 245, 0.60)` |
| `label-tertiary` | `rgba(235, 235, 245, 0.30)` |
| `label-quaternary` | `rgba(235, 235, 245, 0.18)` |

### Backgrounds

**Light:**
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F2F2F7` | page background (grouped background) |
| `surface` | `#FFFFFF` | cards, list containers, rows |
| `surface-secondary` | `#F2F2F7` | inset wells, input backgrounds |
| `surface-hover` | `rgba(60, 60, 67, 0.04)` | row hover |
| `surface-pressed` | `rgba(60, 60, 67, 0.08)` | row active |

**Dark:**
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#000000` | page background |
| `surface` | `#1C1C1E` | cards, list containers, rows |
| `surface-secondary` | `#2C2C2E` | inset wells, inputs |
| `surface-hover` | `rgba(235, 235, 245, 0.06)` | |
| `surface-pressed` | `rgba(235, 235, 245, 0.10)` | |

### Separators

Apple uses two: a translucent hairline and an opaque one.

| Token | Light | Dark |
|---|---|---|
| `separator` | `rgba(60, 60, 67, 0.29)` | `rgba(84, 84, 88, 0.60)` |
| `separator-opaque` | `#C6C6C8` | `#38383A` |

Use `separator` between rows. Use `separator-opaque` for card edges.

### System colors

Apple ships **different values for light and dark**. Another commonly missed signature. Implement both.

| Name | Light | Dark |
|---|---|---|
| `blue` | `#007AFF` | `#0A84FF` |
| `green` | `#34C759` | `#30D158` |
| `red` | `#FF3B30` | `#FF453A` |
| `orange` | `#FF9500` | `#FF9F0A` |
| `yellow` | `#FFCC00` | `#FFD60A` |
| `teal` | `#30B0C7` | `#40C8E0` |
| `indigo` | `#5856D6` | `#5E5CE6` |
| `purple` | `#AF52DE` | `#BF5AF2` |
| `pink` | `#FF2D55` | `#FF375F` |

- **`blue` is the accent.** Focus rings, active nav, selection, primary buttons, links.
- **`green` = success. `red` = destructive. `orange` = warning.**
- **The 8 Life Area colors** come from this palette: blue, green, orange, teal, indigo, purple, pink, red. The user picks. This preserves the "color comes from user data" model while staying fully Apple.

### System grays

| Token | Light | Dark |
|---|---|---|
| `gray-1` | `#8E8E93` | `#8E8E93` |
| `gray-2` | `#AEAEB2` | `#636366` |
| `gray-3` | `#C7C7CC` | `#48484A` |
| `gray-4` | `#D1D1D6` | `#3A3A3C` |
| `gray-5` | `#E5E5EA` | `#2C2C2E` |
| `gray-6` | `#F2F2F7` | `#1C1C1E` |

---

## 5. Liquid Glass materials

### Where glass is allowed (restrained, and this is a hard rule)

**Glass ON:** sidebar, top toolbar / header, modals and sheets, dropdowns and popovers, the floating quick-add bar, context menus.

**Glass OFF, always solid:** every list row, every card, every content surface, anything bearing body text.

Rationale: Apple's own HIG limits this to one primary glass sheet per view and requires text on solid layers. Beyond that, `backdrop-filter` on a scrolling list destroys browser performance. Apple has dedicated silicon for this; a browser does not.

### The material tiers

Apple's vibrancy is `blur` plus `saturate`. The saturate is what stops glass from looking muddy. Do not omit it.

**Light:**
| Tier | Value |
|---|---|
| `glass-ultra-thin` | `background: rgba(255,255,255,0.60); backdrop-filter: blur(20px) saturate(180%);` |
| `glass-thin` | `background: rgba(255,255,255,0.72); backdrop-filter: blur(24px) saturate(180%);` |
| `glass-regular` | `background: rgba(255,255,255,0.84); backdrop-filter: blur(30px) saturate(180%);` |
| `glass-thick` | `background: rgba(255,255,255,0.94); backdrop-filter: blur(40px) saturate(180%);` |

**Dark:**
| Tier | Value |
|---|---|
| `glass-ultra-thin` | `background: rgba(28,28,30,0.60); backdrop-filter: blur(20px) saturate(180%);` |
| `glass-thin` | `background: rgba(28,28,30,0.72); backdrop-filter: blur(24px) saturate(180%);` |
| `glass-regular` | `background: rgba(28,28,30,0.84); backdrop-filter: blur(30px) saturate(180%);` |
| `glass-thick` | `background: rgba(28,28,30,0.94); backdrop-filter: blur(40px) saturate(180%);` |

Assignments: sidebar `glass-thin`. Header `glass-thin`. Dropdowns and popovers `glass-regular`. Modals and sheets `glass-thick`.

### The specular edge

Every glass surface gets a hairline top highlight. This is what sells it as glass rather than as a blur.

```css
box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.50);  /* light */
box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.10);  /* dark */
```
Plus a hairline border: `1px solid rgba(255,255,255,0.18)` light, `rgba(255,255,255,0.08)` dark.

### Mandatory fallbacks

```css
@media (prefers-reduced-transparency: reduce) {
  /* replace every glass surface with its solid equivalent: surface / surface-secondary */
  /* remove backdrop-filter entirely */
}
@supports not (backdrop-filter: blur(1px)) {
  /* solid fallback */
}
```
Contrast requirement: 4.5:1 for text measured **after** the blur is applied. If a glass surface cannot hold 4.5:1, put the text on an inner solid layer.

---

## 6. Radius and concentricity

Apple's iOS 26 HIG emphasizes concentric design: aligning interface shapes so they nest harmoniously.

**The concentric rule:** `inner radius = outer radius − padding`. A 16px-radius card with 12px padding contains 4px-radius children. Apply this everywhere. Almost nobody implements it, and it is a large part of why Apple UI feels resolved.

| Token | px | Use |
|---|---|---|
| `xs` | 4 | nested elements inside padded cards |
| `sm` | 6 | small chips, checkboxes |
| `md` | 8 | small buttons |
| `lg` | 10 | buttons, inputs |
| `xl` | 12 | inner cards |
| `2xl` | 16 | cards, list containers |
| `3xl` | 20 | modals, popovers |
| `4xl` | 26 | large sheets |
| `full` | 9999 | pills, avatars, segmented controls |

Progressive enhancement, optional: `corner-shape: squircle` where supported, for Apple's continuous corners. Plain `border-radius` is the fallback and is acceptable.

---

## 7. Spacing

8pt grid with 4pt subdivisions. Allowed values only: **2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64**.

### The proximity law

This is the fix for the spacing problem, and it is independent of aesthetic direction. Uniform gaps destroy hierarchy.

| Relationship | Gap |
|---|---|
| Icon to its label | 8 |
| Checkbox to task title | 12 |
| Between rows in a list | 0 (separator hairline instead) |
| Label to its input | 6 |
| Between form fields | 16 |
| Card title to content | 12 |
| Between items inside a group | 8 |
| **Between distinct groups** | 24 |
| **Between page sections** | 32 |
| Page top padding | 24 |

**The rule: a gap between groups must be at least 3x the gap within a group.** 8 inside, 24 outside. Never 8 and 12. Near-equal spacing is exactly what makes a UI look machine-generated.

### Layout
- Page padding: 24 desktop, 16 mobile.
- Content max-width: 720px for focused lists. 1200px for dashboard grids.
- Sidebar: 260px. Collapsed: 56px.
- **Minimum tap target: 44x44px.** A genuine Apple HIG rule, not a convention. Ghost icon buttons may be visually 28px but must carry a 44px hit area via padding or a pseudo-element.

---

## 8. Component metrics

### Task row
- Height: **40px** (macOS-adjacent density, not a 44px phone row)
- Padding-x 12, checkbox-to-title gap 12
- Separator hairline between rows, inset 12px from the left to align under the title (Apple's inset separator signature)
- Rest transparent, hover `surface-hover`, active `surface-pressed`
- Life Area shown as an 8px dot in the system color
- Interactive children must still carry their own 44px hit areas

### Checkbox
- 20x20, radius `full` (Apple uses circles in Reminders), border 1.5px `gray-3`
- Checked: fills with the Life Area system color, white check, 2px stroke
- Do not use a square checkbox. The circle is the Apple signature here.

### Button
| Size | Height | Padding-x | Radius | Font |
|---|---|---|---|---|
| sm | 28 | 10 | 8 | 13 / 500 |
| md | 32 | 14 | 10 | 14 / 500 |
| lg | 40 | 18 | 12 | 15 / 500 |

Variants:
- `primary`: `blue` background, white label, weight 500
- `secondary`: `surface-secondary` background, `label` text, no border
- `ghost`: transparent, `blue` label, hover `surface-hover`
- `destructive`: `red` background, white label

States: hover (lighten 6%), active (`scale(0.96)` plus `opacity(0.8)`), focus-visible (3px `blue` ring at 40% opacity, 2px offset), disabled (`label-quaternary`), loading (spinner, width stable).

### Input
- Height 32, padding-x 10, radius 10
- Background `surface-secondary`, no border at rest (Apple's filled-field style)
- Focus: 3px `blue` ring at 40%, background `surface`

### Segmented control
Apple signature. Use it for the Today / Week / Month switchers.
- Height 30, radius `full`, track `surface-secondary`, padding 2
- Selected pill: `surface`, radius `full`, shadow `e1`, **animated with `layoutId`** so it slides between segments

### Card
- Radius 16, padding 16, background `surface`, border 1px `separator-opaque`, shadow `e1`
- Children inside get radius 4 per the concentric rule

### Sidebar item
- Height 32, padding-x 10, radius 8, gap 8
- Active: `blue` at 12% opacity background, `blue` label and icon
- Sidebar surface: `glass-thin`

### Modal
- Width 480, radius 20, padding 24, `glass-thick`
- Overlay: `rgba(0,0,0,0.32)`, no blur on the overlay itself (the sheet carries the glass)

### Icons
- **lucide-react at 16px, stroke-width 1.5** for inline UI.
- 20px stroke 1.5 for sidebar. 28px stroke 1.5 for empty states.
- Apple's icon coherence comes from icons optically matching type weight. At body 400 to 500, stroke 1.5 is correct. Never stroke 2 (the lucide default reads heavy and generic). Never 24px inline.

### Elevation

Cool shadows. Glass surfaces use the specular edge instead of heavy shadow.

| Token | Value |
|---|---|
| `e1` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03)` |
| `e2` | `0 2px 6px rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.05)` |
| `e3` | `0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)` |

Dark mode: halve the opacities, rely on `separator` and the specular edge.

---

## 9. Motion: Apple springs

**This is the single biggest differentiator, and where most Apple imitations fail.** Apple does not use cubic-bezier easing curves. Apple uses **springs**, and they are **interruptible** and carry velocity. A fade with an ease-out curve will never feel like Apple no matter how correct the colors are.

Library: `motion` (formerly framer-motion), which supports spring `duration` and `bounce` that map directly onto SwiftUI's response and dampingFraction.

### The three springs. Use only these.

```ts
export const spring = {
  smooth: { type: "spring", duration: 0.30, bounce: 0 },     // SwiftUI .smooth
  snappy: { type: "spring", duration: 0.30, bounce: 0.15 },  // SwiftUI .snappy
  bouncy: { type: "spring", duration: 0.50, bounce: 0.30 },  // SwiftUI .bouncy
} as const;
```

Assignments:
- Color, opacity, hover: `smooth`
- Press, toggle, selection, most UI: `snappy`
- Task completion, celebratory moments only: `bouncy`

### Morph, do not fade

Liquid Glass elements morph shape rather than cross-fade. In `motion`, this is `layoutId` for shared-element transitions. Use it for:
- The segmented control selection pill
- Modal open from its trigger element
- Sidebar active indicator
- Any element that becomes another element

This is the highest-leverage single detail in this document.

### Specific choreography
- **Press:** `scale(0.96)`, `snappy`
- **List entrance:** fade plus 4px translateY, 20ms stagger, cap 8 items, `smooth`
- **Task completion:** checkbox `bouncy` scale 1 to 1.2 to 1, strikethrough sweeps left to right 200ms, row fades and collapses height with `smooth`
- **Modal:** `scale(0.94)` to 1 with fade, `snappy`. On close, reverse.
- **Glass panels:** on appear, scale from 0.96 with the blur ramping 0 to full over the spring
- **Never** use a duration above 500ms. Never use `ease-in-out`.

### Reduced motion
`prefers-reduced-motion: reduce` keeps opacity changes, drops all transforms, stagger, and `layoutId` morphs. Apple's own guidance also caps specular highlight movement; if you add any parallax, keep amplitude at or under 6px and disable it under reduced motion.

---

## 10. The two cinematic screens

apple.com's marketing language belongs in exactly two places, nowhere else. GoHa is a daily driver and cinematic transitions on a task list are hostile to it.

**Focus Mode:** `large-title` at 34px mono tabular for the timer, near-empty chrome, canvas darkens on session start, the glass toolbar recedes. This is the one screen where calm and big type genuinely serve the purpose.

**Login:** one message, generous negative space, a single `blue` primary action, a slow `smooth` entrance. Restrained.

Everywhere else: no scroll-jacking, no pinned sections, no parallax, no reveal-on-scroll.

---

## 11. What makes this read as Apple rather than as an imitation

1. Label opacity system (rgba labels, not hex grays).
2. Different system color values in light versus dark.
3. `font-optical-sizing: auto` on Inter v4, reproducing the SF Display/Text crossover.
4. Tracking that tightens as size grows.
5. Springs, not cubic-bezier. Interruptible, velocity-carrying.
6. `layoutId` morphs instead of fades.
7. `saturate(180%)` alongside blur, plus the specular top edge.
8. Concentric radii: inner = outer − padding.
9. Inset separators aligned under the title.
10. Circular checkboxes.
11. Glass on chrome only, never on rows.
12. Tabular numbers everywhere.
