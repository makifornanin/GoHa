# STITCH_AUDIT.md — GoHa Design Audit

Source of truth: the Stitch exports in `design/stitch_goha_productivity_system_dashboard/`. There is no Stitch MCP connected in this environment, so this audit was produced by reading every exported `code.html` (the authoritative Tailwind config and markup), every `screen.png` (rendered reference), and the design system spec in `serene_lifecycle/DESIGN.md`.

Design system name: **Serene Lifecycle**. Philosophy: "Intentional Calm", a Zen office aesthetic, desaturated earth tones, generous whitespace, soft paper-stack elevation. It is a Material 3 style token scheme seeded from the sage primary `#4c635f`.

Note on precedence: where the DESIGN.md prose and the exported `code.html` Tailwind config disagree (for example the prose mentions `#8fa7a3` primary and `#faf8f3` background), the **exported `code.html` config is authoritative** because it is what actually rendered. The prose hexes are treated as descriptive only.

---

## 1. Screen inventory

Twelve screens were exported. Each has a `code.html` and a `screen.png`.

| # | Screen (folder) | Purpose | Stage |
|---|-----------------|---------|-------|
| 1 | `today_dashboard` | Today home: greeting, Today's Focus, Top 3 Actions, Life Score, Upcoming, Habits, quick add, evening reflection | MVP |
| 2 | `goals_management` | Goals grid with status badges, progress, filter tabs (Today/Week/Month/Quarter/Year/All), add-goal card | MVP |
| 3 | `to_do_lists` | Tasks with a Views sub-nav (Inbox/Today/Week/Month/Quarter/Year/Done), full and compact task cards, priority accents | MVP |
| 4 | `life_areas_dashboard` | Life balance overview: summary widgets + bento grid of life area cards with life scores | MVP |
| 5 | `settings_preferences` | Profile, Appearance, System Customization (life areas, status nomenclature, focus timers), Life Score Balance sliders, Notifications | MVP (polish in V1b) |
| 6 | `habit_tracker` | Habit list, streaks, boolean and numeric entries | V1b |
| 7 | `focus_session` | Focus timer / session mode | V1b |
| 8 | `brain_dump_quick_capture` | Fast capture inbox | V1b |
| 9 | `task_map_explorer` | React Flow style node map of tasks | V1b |
| 10 | `calendar_schedule` | Calendar / schedule view | V1b |
| 11 | `weekly_review_reflection` | Weekly review and reflection | V1b |
| 12 | `life_score_progress_analytics` | Progress analytics and life score trends | V1b |

Not present in the design and to be designed in the same visual language: **authentication** (login, register). See section 6.

---

## 2. Route map

The sidebar navigation is consistent across all exports and lists twelve destinations plus a Help/Logout footer. Route slugs below follow the CLAUDE.md MVP naming (for example `/tasks` even though the nav label reads "To-dos").

| Nav label | Route | Group | Phase | Icon (Material -> lucide) |
|-----------|-------|-------|-------|---------------------------|
| Today | `/today` | (app) | MVP | `today` -> `CalendarDays` |
| Goals | `/goals` | (app) | MVP | `emoji_events` -> `Trophy` |
| To-dos | `/tasks` | (app) | MVP | `checklist` -> `ListChecks` |
| Task Map | `/task-maps` | (app) | V1b | `map` -> `Waypoints` |
| Focus | `/focus` | (app) | V1b | `center_focus_strong` -> `Focus` |
| Habits | `/habits` | (app) | V1b | `repeat` -> `Repeat` |
| Calendar | `/calendar` | (app) | V1b | `calendar_month` -> `Calendar` |
| Brain Dump | `/brain-dump` | (app) | V1b | `psychology` -> `Brain` |
| Life Areas | `/life-areas` | (app) | MVP | `category` -> `Shapes` |
| Review | `/review` | (app) | V1b | `rate_review` -> `NotebookPen` |
| Progress | `/progress` | (app) | V1b | `query_stats` -> `TrendingUp` |
| Settings | `/settings` | (app) | MVP | `settings` -> `Settings` |
| (footer) Help | `/help` (deferred) | (app) | later | `help` -> `CircleHelp` |
| (footer) Logout | auth action | (app) | Phase Auth | `logout` -> `LogOut` |

Additional:
- `/` redirects to `/today`.
- `(auth)` group: `/login`, `/register`.

Scope note: CLAUDE.md step for this phase asks explicitly for `today, life-areas, goals, tasks, settings` plus stubs for `habits, focus, brain-dump, task-maps`. Because the shared sidebar also links `calendar`, `review`, and `progress`, those three are also created as labeled stub routes so the navigation has no dead links. This is a conservative extension in the same visual language, not new scope.

---

## 3. Component inventory

Shell (chrome):
- **SideNavBar** (`aside`/`nav`, `w-sidebar-width` = 280px, `bg-surface-container-low`, right border `outline-variant`, hidden below `md`). Brand block (avatar + "GoHa" + "Life Operating System"), primary "Quick Action" button, scrollable nav list, footer (Help, Logout).
- **TopAppBar** (fixed, `h-16`, `bg-surface/80` + `backdrop-blur-md`, bottom border). Contents vary by screen: optional search pill, "Focus Mode" outline button, "Add Task" primary button, notifications, dark-mode toggle, avatar. Offset by sidebar width on desktop.
- **MobileHeader** (`md:hidden`, sticky top): hamburger + brand + notifications.
- **MobileBottomNav** (`md:hidden`, fixed bottom): Today, To-dos, center FAB (+), Calendar, Settings. FAB is a 48px sage circle raised above the bar.
- **NavItem**: icon + label, rounded-lg, active state uses a container tint (`bg-primary-fixed` / `bg-primary-container` / `bg-secondary-container` depending on export) with bold text; inactive is `text-on-surface-variant` with hover `bg-surface-container-high`.

Content primitives:
- **Card**: `bg-surface-container-lowest` (white), `rounded-xl` (12px), 1px `outline-variant`/`surface-container-high` border, ambient shadow `0 4px 20px rgba(27,27,33,0.04)`, hover lifts `translateY(-1px)` with a slightly stronger shadow. Optional decorative corner blob (`rounded-bl-full`, low-opacity accent).
- **StatWidget**: label (uppercase `label-sm`), big value (`headline-lg`), round tinted icon.
- **LifeAreaCard**: icon chip, title, big life-score percentage, area progress bar, goals/tasks mini rows.
- **GoalCard**: category chip, `more_vert` menu, title, 2-line clamp description, status badge (Not Started / In Progress / On Track / At Risk), percentage, progress bar, meta footer (tasks count, habits/docs count, due date). Includes a dashed **AddCard** ("Create New Goal").
- **TaskCard** (full): left priority accent bar (error/outline), round checkbox, title, status pill, description, meta chips (priority, linked goal, category, time), hover action bar (Open Task Map, Start Focus, Mark Done).
- **TaskCard** (compact): checkbox, title, meta dots, hover quick actions.
- **SubViewNav** ("Views" rail on To-dos): Inbox/Today/Week/Month/Quarter/Year/Done with counts and an active indicator bar.
- **FilterTabs** (Goals): horizontal, underline active, horizontally scrollable on mobile.
- **StatusBadge**, **PriorityTag**, **CategoryChip**: small pill/rounded tags using container tints.
- **ProgressBar**: thin track (1.5px to 4px) `bg-surface-variant`, fill `bg-primary` / `bg-primary-container` / status color.
- **CircularProgress**: inline SVG ring (Life Score), track `surface-container-highest`, fill `primary`.
- **HabitRow**: round tinted icon + name + check toggle button.
- **UpcomingEventItem**: time chip + title + location line.
- **QuickAddBar**: input with leading icon and return-key button.
- **Forms** (Settings): labeled text inputs (subtle tint bg, 1px border, sage focus ring), removable chips ("Career x"), status color dots, numeric steppers ("25 min"), sliders (Life Score Balance), toggles (Notifications), theme preview cards (Light/Dark/System).

To be added (not in exports, needed by CLAUDE.md section 9):
- **EmptyState** (icon, title, message, optional action) for every data surface.
- **Skeleton** loaders, **ErrorState**, form validation messages, accessible **Dialog**/**Sheet** (mobile nav drawer).

---

## 4. Design tokens

All values below are taken verbatim from the exported Tailwind configs (`code.html`) and `serene_lifecycle/DESIGN.md` frontmatter. These become CSS variables and the Tailwind v4 theme. No scattered hex values in components.

### 4.1 Color (light)

Material 3 style semantic roles:

```
surface                     #faf9f8
surface-dim                 #dbdad9
surface-bright              #faf9f8
surface-container-lowest    #ffffff
surface-container-low       #f5f3f2
surface-container           #efeeec
surface-container-high      #e9e8e7
surface-container-highest   #e3e2e1
background                  #faf9f8
on-surface                  #1b1c1b
on-surface-variant          #424847
on-background               #1b1c1b
outline                     #727877
outline-variant             #c2c8c6
inverse-surface             #303130
inverse-on-surface          #f2f0ef
inverse-primary             #b3ccc7
surface-tint                #4c635f
surface-variant             #e3e2e1

primary                     #4c635f   (deep sage/teal, primary actions, progress)
on-primary                  #ffffff
primary-container           #8fa7a3   (sage, active nav, softer emphasis)
on-primary-container        #273d3a
primary-fixed               #cfe8e3
primary-fixed-dim           #b3ccc7
on-primary-fixed            #081f1d
on-primary-fixed-variant    #354b48

secondary                   #6a5c46   (warm taupe / beige family)
on-secondary                #ffffff
secondary-container         #f3e0c3
on-secondary-container      #71624c
secondary-fixed             #f3e0c3
secondary-fixed-dim         #d6c4a8
on-secondary-fixed          #241a08
on-secondary-fixed-variant  #524530

tertiary                    #5c5b7a   (muted lavender)
on-tertiary                 #ffffff
tertiary-container          #a19fc1
on-tertiary-container       #363652
tertiary-fixed              #e2dfff
tertiary-fixed-dim          #c5c3e6
on-tertiary-fixed           #191933
on-tertiary-fixed-variant   #454461

error                       #ba1a1a
on-error                    #ffffff
error-container             #ffdad6
on-error-container          #93000a
```

Category accents used inline on Life Areas (kept as extra tokens): health/beige `#c9b79c`, finance/lavender `#a9a7c9`.

### 4.2 Color (dark)

The exports reference `dark:` utilities (for example `dark:bg-surface-dim`, `dark:text-primary-fixed-dim`) but do not ship a full dark palette. A coherent Material 3 dark tonal palette was derived from the same source color and the light "fixed"/"inverse" hints. Implemented values:

```
background / surface        #131413
surface-dim                 #131413
surface-bright              #393a39
surface-container-lowest    #0e100f
surface-container-low       #1b1c1b
surface-container           #1f201f
surface-container-high      #2a2a29
surface-container-highest   #343534
on-surface                  #e3e2e1
on-surface-variant          #c2c8c6
outline                     #8c9291
outline-variant             #424847
inverse-surface             #e3e2e1
inverse-on-surface          #2f312f
inverse-primary             #4c635f

primary                     #b3ccc7
on-primary                  #1d3531
primary-container           #354b48
on-primary-container        #cfe8e3
secondary                   #d6c4a8
on-secondary                #3a2f1b
secondary-container         #524530
on-secondary-container      #f3e0c3
tertiary                    #c5c3e6
on-tertiary                 #2e2d48
tertiary-container          #454461
on-tertiary-container       #e2dfff
error                       #ffb4ab
on-error                    #690005
error-container             #93000a
on-error-container          #ffdad6
```

Dark mode strategy: class based (`.dark`), via `next-themes`. Default theme is light (design is light first); System and Dark are available from the header toggle.

### 4.3 Typography

Font family: **Manrope** (Google Fonts, weights 300/400/500/600/700), loaded through `next/font`. Icons: the exports use **Material Symbols Outlined**; per CLAUDE.md the app uses **lucide-react** instead (mapping in section 2).

Type scale (size / line-height / letter-spacing / weight):

```
display-lg          40 / 48 / -0.02em / 300
display             40 / 48 / -0.02em / 600
headline-lg         32 / 40 / -0.01em / 500
headline-lg-mobile  24 / 32 /   0     / 500
headline-md         24 / 32 /   0     / 500
body-lg             18 / 28 /   0     / 400
body-md             16 / 24 /   0     / 400   (base body)
label-md            14 / 20 /  0.02em / 600
label-sm            12 / 16 /  0.05em / 500
```

Usage: display weight 300 for greetings/date, medium 500 for section headers, semibold 600 for labels; slight negative tracking on headlines, slightly increased tracking on small labels.

### 4.4 Spacing

8px base unit. Named tokens:

```
unit               8px
stack-sm           8px
stack-md           16px
stack-lg           32px
gutter             24px
container-margin   32px
container-padding  32px
section-gap        64px
sidebar-width      280px
```

Grid: desktop 12 col / 24px gutters, tablet 8 col / 20px, mobile 4 col / 16px. Content max-width 1200px, centered. Outer margins 32px desktop, 16px mobile.

### 4.5 Radius

Design radii match Tailwind defaults, so defaults are kept:

```
rounded (DEFAULT)  0.25rem   (buttons/inputs use ~8px = rounded-lg here)
rounded-lg         0.5rem    (buttons, inputs, nav items)
rounded-xl         0.75rem   (cards, primary containers)
rounded-full       9999px    (chips, pills, avatars, FAB)
```

### 4.6 Elevation and shadows

Tonal layering plus soft ambient shadows (no heavy black):
- Level 0 background: `#faf9f8`.
- Level 1 cards: white, 1px `outline-variant`/`surface-container-high` border, shadow `0 4px 20px rgba(27,27,33,0.04)`; hover `0 8px 24px rgba(27,27,33,0.08)` with `translateY(-1px)`.
- Level 2 modals/popovers: `0 12px 40px rgba(0,0,0,0.05)`.

Exposed as a `card-shadow` / `card-hover` helper.

### 4.7 Motion

Subtle: `transition-colors`/`transition-all` ~200 to 300ms, `active:scale-95` press feedback, hover icon `scale-110`, card hover lift. Keep calm, avoid aggressive animation.

---

## 5. Missing states (to design conservatively in the same language)

The Stitch exports show only populated success states. The following are absent and must be added per CLAUDE.md section 9:
- **Empty**: no life areas, no goals, no tasks, empty Today, empty habits/inbox. A shared `EmptyState` (calm icon, one-line title, supportive sentence, single primary action).
- **Loading**: skeletons for cards, lists, and the Today bento. No infinite/fake skeletons.
- **Error**: retriable error panels for each data surface; never a blank white panel; never swallow server errors.
- **Form validation**: inline field errors and success feedback (Sonner) for Settings and future create/edit dialogs.
- **Auth screens**: login and register do not exist in the design; build in the Serene Lifecycle language (centered card on the paper background, sage primary button, Manrope).
- **Focus-visible / disabled / active** states for all interactive controls (accessibility).
- **Dark palette**: only partially implied by the exports; full dark scheme derived (section 4.2).

---

## 6. Responsive notes

- **Breakpoint model**: mobile-first, single `md` (768px) split between mobile and desktop chrome; `lg` used for the To-dos Views rail and some grid density.
- **Chrome**: below `md` the 280px sidebar is hidden and replaced by a sticky mobile header (hamburger opens a slide-in drawer with the full nav) plus a fixed bottom nav (Today, To-dos, +FAB, Calendar, Settings). Desktop content is offset by `sidebar-width` and by the 64px top app bar.
- **Containers**: content centered at `max-width: 1200px`; horizontal padding 32px desktop, 16px mobile; never allow horizontal overflow.
- **Grid collapse**: Life Areas 4 -> 3 -> 2 -> 1; Goals 3 -> 2 -> 1; Today bento 12-col -> stacked single column; To-dos 3-col Views rail hides below `lg`.
- **Type**: headlines step down from `headline-lg` (32) to `headline-lg-mobile` (24).
- **Touch**: bottom-nav targets and the 48px FAB meet touch-size guidance; filter tabs scroll horizontally with a hidden scrollbar; dialogs must not clip on small screens.

---

## 7. Icon mapping (Material Symbols -> lucide-react)

`add` -> Plus, `search` -> Search, `notifications` -> Bell, `dark_mode` -> Moon, `account_circle` -> CircleUserRound, `today` -> CalendarDays, `emoji_events` -> Trophy, `checklist` -> ListChecks, `map` -> Waypoints, `center_focus_strong` -> Focus, `repeat` -> Repeat, `calendar_month` -> Calendar, `psychology` -> Brain, `category` -> Shapes, `rate_review` -> NotebookPen, `query_stats` -> TrendingUp, `settings` -> Settings, `help` -> CircleHelp, `logout` -> LogOut, `menu` -> Menu, `check` -> Check, `more_vert` -> EllipsisVertical, `event` -> CalendarClock, `flag` -> Flag, `play_arrow` -> Play, `nightlight` -> Moon, `arrow_forward` -> ArrowRight, `filter_list` -> ListFilter, `tune` -> SlidersHorizontal.
