# DESIGN_SYSTEM.md — SUPERSEDED

**This document is retired. The visual source of truth is now `docs/GOHA_DESIGN_SPEC.md` (Apple HIG / Liquid Glass), which replaces the Nightshift direction below in full as of 2026-07-16.**

Current implementation status: the Apple spec is fully rolled out as of 2026-07-16: token layer (`app/globals.css`), fonts (Inter v4 + Geist Mono), motion (`lib/motion.ts`, the three Apple springs), the shared primitives (`components/ui/*`), the glass shell chrome, and EVERY screen (Today, Login, Focus, Tasks, Goals, Habits, Life Areas, Brain Dump, Settings, Task Maps incl. the React Flow canvas). Remaining debt: form-modal internals and non-Today loading skeletons still render through the legacy alias layer in `globals.css`; the aliases stay until those are tightened.

The Nightshift text below is kept only as a historical record of the previous direction.

---

# (Retired) GoHa "Nightshift"

Codename: Nightshift. A precision instrument aesthetic for a personal execution system. The reference of quality is mission control and high end professional tooling, not a sci-fi movie poster. Restraint is what makes it read as expensive and real.

---

## 1. Principles

1. **Dark first.** The canvas is a deep near black with a subtle cool blue undertone, never pure black (`#000`) and never a flat neutral gray. Elevation is communicated by a layered surface ramp (surface lightness rising with elevation) plus a 1px hairline border, not by heavy drop shadows.
2. **Light equals meaning.** One luminous primary accent, electric cyan, is reserved for active state, focus, selection, and the single most important action on a screen. A restrained secondary accent, violet, carries progress and data. Semantic colors (success, warning, destructive) mean exactly what they say. If everything glows, nothing means anything.
3. **Precision typography.** A geometric sans (Manrope) for UI with real weights and tightened tracking on headings, plus a mono (JetBrains Mono) for numbers, timers, counts, dates, and metadata. Tabular figures everywhere data appears.
4. **Density with air.** Productivity rewards information density on a strict 4px spacing rhythm: tight where scanning matters, generous around focus.
5. **Hairline detail.** 1px borders at low opacity, a subtle inner top highlight on raised surfaces, crisp radii on a consistent scale.

### Explicit non goals (the futuristic cliches we avoid)

- No neon on every surface. Cyan is scarce by design.
- No glassmorphism on every panel. Backdrop blur is used only on the sticky app bar and modal scrim.
- No purple gradient page backgrounds. The canvas is a solid near black.
- No Orbitron or wide techno display fonts. No floating particles.
- No glow on inactive elements. Glow (a soft accent ring or shadow) appears only on the active or focused element.

---

## 2. Color tokens

All colors are defined in OKLCH for a perceptually even ramp and are exposed as CSS variables, then mapped into the Tailwind theme. There are no scattered hex values in components (CLAUDE.md section 9). Dark is the primary theme; a coherent light theme is provided for `next-themes`.

### 2.1 Surface ramp (elevation)

Elevation reads as: brighter surface + hairline border. Lower numbers sit deeper.

| Token | Role (dark) |
| --- | --- |
| `--background` / `--surface` | App canvas, the deepest layer |
| `--surface-container-lowest` | Cards and primary panels sitting on the canvas |
| `--surface-container-low` | Sidebar, secondary panels, quiet fills |
| `--surface-container` | Inset wells, quick add, hovered rows |
| `--surface-container-high` | Hovered controls, chips, raised affordances |
| `--surface-container-highest` | Track backgrounds, top of the ramp |
| `--surface-variant` | Dividers as fills, progress tracks |
| `--surface-bright` | The brightest neutral surface |

Foreground: `--on-surface` (primary text), `--on-surface-variant` (secondary text), `--outline` (muted icons, placeholders), `--outline-variant` (hairline borders and dividers).

### 2.2 Accents

- **Primary, electric cyan** (`--primary`, `--primary-hover`, `--primary-active`, `--on-primary`). Reserved for: the single most important action on a screen, focus rings, active navigation, selection. `--primary-container` / `--on-primary-container` provide a dim cyan tint for quiet accent backgrounds.
- **Secondary, violet** (`--secondary`, `--secondary-container`, `--on-secondary-container`). Reserved for progress and data visualization (meters, rings, goal bars). It never competes with cyan for "the action."
- **Tertiary** (`--tertiary`): a bluer violet used for quiet categorical labels.

### 2.3 Semantic

- `--success` (green), `--warning` (amber), `--error` / `--destructive` (red), each with an `on-*` and a `-container` tint. Used for status only, never decoration.

### 2.4 Category accents (Life Areas)

`--accent-beige` (warm amber) and `--accent-lavender` (soft violet) plus the primary/secondary/tertiary/outline families back the six Life Area color keys in `lib/life-areas.ts`. These are the only place multiple hues appear together, and they are always low chroma tiles, never full saturation fills.

### 2.5 Elevation shadows

Shadows are subtle and cool, never heavy black. `--shadow-sm` (resting cards), `--shadow-md` (raised/hover), `--shadow-glow` (a soft cyan halo used ONLY on the active primary action). Elevation is carried mostly by the surface ramp; shadow is a supporting cue.

---

## 3. Typography

Sans: **Manrope** (`--font-sans`), a clean geometric sans with `font-feature-settings: "ss01","cv11"` and calibrated tracking. Mono: **JetBrains Mono** (`--font-mono`), used through the `font-mono` utility and the `.tabular` helper for all figures.

Type scale (defined in `@theme`, size / line-height / tracking / weight baked in):

| Token | Use |
| --- | --- |
| `text-display-lg` | Greeting / hero numerics |
| `text-display` | Large hero headings |
| `text-headline-lg` | Page titles |
| `text-headline-md` | Section titles |
| `text-body-lg` | Lead paragraphs |
| `text-body-md` | Body |
| `text-body-sm` | Dense body |
| `text-label-md` | Buttons, nav, emphasized labels |
| `text-label-sm` | Meta, chips, overlines (uppercase, wide tracking) |
| `text-mono-lg` / `text-mono-md` / `text-mono-sm` | Data readouts, timers, counts (tabular) |

Rules: headings tighten tracking (`-0.01em` to `-0.02em`); overlines and small labels widen it. Numbers that represent data (counts, percentages, times, dates) use the mono face with tabular figures so columns and updates never shift.

---

## 4. Shape and spacing

Radius scale (crisp, consistent): `--radius-xs` 4px, `--radius-sm` 6px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-xl` 16px, `--radius-2xl` 20px, plus `--radius-full`. Cards use `lg`, controls use `md`, chips use `sm`, pills use `full`.

Spacing rhythm: multiples of 4px. Card padding 20 to 24px. Section gaps 16 to 32px. Row padding 8 to 12px. Tight clusters use 4 to 8px.

Hairline: borders are 1px `--outline-variant`, frequently at 60 to 80 percent opacity. Raised surfaces may add a subtle inner top highlight via the `.raised` helper (a 1px inset light line) to catch the eye like brushed metal.

---

## 5. Motion

Motion must feel instant and physical, never slow or decorative. It respects `prefers-reduced-motion` (the app wraps interactive regions in `MotionConfig reducedMotion="user"`, and variants collapse to opacity only).

Defined in `lib/motion.ts`:

- **Springs.** `springSnappy` (stiffness 520, damping 34, mass 0.8) for press and pop. `springSmooth` (stiffness 320, damping 32) for layout and larger moves.
- **Easing.** `easeOutExpo` = `cubic-bezier(0.2, 0, 0, 1)`, a decisive ease out for tween transitions.
- **Durations.** `fast` 0.12s, `base` 0.18s, `slow` 0.24s. Nothing routine exceeds 0.24s.
- **List entrance.** `listContainer` staggers children by 0.035s; `listItem` fades and rises 8px. Used for the Today sections and rows.
- **Micro interactions.** `pressable` = `whileHover` scale 1.02, `whileTap` scale 0.97, on `springSnappy`. Buttons also press via CSS `active:scale`.
- **Layout transitions.** Reordering and add/remove use `layout` + `AnimatePresence` with `springSmooth`.
- **Task completion.** Completing a checklist item springs the checkbox (scale pop) and draws the check, then settles the label to a struck, dimmed state. Satisfying, under 0.3s total, never blocking the optimistic update.

---

## 6. Components

Primitives are fully custom (hand authored, not raw Radix). Shared primitives keep their existing APIs so the rest of the app keeps working; they gain the Nightshift treatment through tokens plus targeted enhancements.

- **Button** (`ui/button.tsx`): variants `default` (cyan, the primary action), `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes `sm/default/lg/icon`; real hover, `active:scale` press, `focus-visible` cyan ring with offset, `disabled`, and a `loading` state (spinner, preserves width, blocks clicks). The default variant carries the reserved cyan and, when marked the hero action, a soft glow.
- **Input / Textarea** (`ui/input.tsx`, `ui/textarea.tsx`): surface field, hairline border, placeholder in `--outline`, precise cyan focus ring (`border-primary` + `ring-primary/30`).
- **Select** (`ui/select.tsx`): styled native select (kept native for accessibility and mobile), with the shared field treatment.
- **Dropdown** (`ui/dropdown.tsx`): custom menu built beyond Radix defaults: a trigger plus a popover list with full keyboard support (Arrow keys, Home/End, Enter, Escape, type ahead focus, roving tabindex), `AnimatePresence` open/close on `springSnappy`, and hover/selected states. Used for row and section overflow actions.
- **Card** (`ui/card.tsx`): the surface ramp primitive. Props for `tone` (default / raised / accent), optional `interactive` hover lift, and the hairline + `.raised` highlight. Header/Title/Content subcomponents.
- **Progress** (`ui/progress.tsx`): linear meter and a `ProgressRing`, both on the violet secondary accent, with a motion fill/sweep and tabular readouts.
- **Dialog / Modal** (`ui/modal.tsx`): scrim fade plus panel spring in/out via `AnimatePresence`, on top of the existing focus trap, Escape, scroll lock, and focus restoration. Bottom sheet on mobile, centered on desktop.
- **Tooltip** (`ui/tooltip.tsx`): hover and focus triggered, delayed, positioned, motion in/out, for icon buttons and terse affordances.
- **Toast** (`ui/sonner.tsx`): Sonner themed to the surface tokens with a hairline border and cool shadow.

### Component rules

- Every major data surface handles loading (content shaped skeleton), empty (with personality), error, and success. No blank panels, no endless fake skeletons.
- Row actions reveal on hover/focus (opacity), never on permanent display, to keep scanning calm.
- Exactly one element per screen may carry the cyan hero treatment. On Today it is "Start Focus Session".
- Cursor affordances: `cursor-pointer` on real actions, `cursor-not-allowed` on disabled.

---

## 7. The Today reference screen

Hierarchy, top to bottom:

1. **Greeting** with a mono date readout: quiet, sets context.
2. **Focus hero**: the single most important daily action. Deep accent card, the task title as the largest type, and the unmistakable cyan "Start Focus Session" button (the only hero on the screen). When nothing is set, a calm empty prompt.
3. **Top 3 Actions** and **Today's Tasks**: dense, scannable checklists with the completion animation and hover reveal actions.
4. **Overdue**: only present when it exists, marked with the error accent, never alarmist.
5. **Right rail**: Today's Progress ring (violet), Active Goals (violet meters), Habits snapshot. Data, not actions.
6. **Quick add** and **Evening Reflection** entry points at the foot.

Empty state with personality: when the day is genuinely empty (no tasks, priorities, goals, or habits), a single centered panel invites the first action rather than showing several empty cards.

---

## 8. Accessibility

Semantic HTML, keyboard support on every custom control, visible cyan focus rings, labeled form fields, `aria-label` on icon only buttons, accessible dialogs (`role="dialog"`, `aria-modal`, focus trap), and reduced motion support. Color is never the only signal: status uses text/icon alongside hue, and contrast targets WCAG AA on the dark canvas.
