# Graph Report - c:\Users\Mark\GoHa App  (2026-08-12)

## Corpus Check
- 263 files · ~289,720 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1619 nodes · 3758 edges · 117 communities (95 shown, 22 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.81)
- Token cost: 886,865 input · 0 output

## Community Hubs (Navigation)
- Task Map Server Actions
- Calendar and Date Engine
- Brain Dump Actions and Pages
- Design Mockup Concepts
- Goals Actions and Forms
- Life Areas Module
- Focus Session Actions
- Task Cards and Detail Panel
- Dev Dependencies
- Habit Streak Engine
- App Shell Navigation
- Auth and Priorities Schema
- Habit Forms and Week Grid
- Task Map Workspace and Repo
- Today Dashboard Widgets
- TypeScript Configuration
- Initial Schema Migration
- Database Schema Definitions
- Life Areas Dashboard Design
- Page Entry Points
- Auth Form and Theme Settings
- Settings Screen Design
- Route Pages and Today Actions
- Brain Dump and Focus Widgets
- Design System Lineage
- DB Client and Habits Repo
- Goals Management Design
- Route Error Boundaries
- Habit Server Actions
- Task Creation and Quick Add
- Task Actions and List View
- To-Do Lists Design
- Weekly Review Design
- Settings Actions and Timezones
- Goals Repository
- Today Dashboard Design
- Habit Logging Controls
- shadcn Component Config
- Dropdown and Tooltip Primitives
- Calendar Screen Design
- Auth Routes and Pages
- Tech Stack and Early Phases
- Goal and Task Card Components
- Progress Analytics Design
- Task Map Explorer Design
- Package Scripts
- Focus Sessions Repository
- Tasks Repository
- Habit Tracker Design
- Feature Phase Notes
- Brain Dump Capture Design
- Runtime Dependencies
- Focus Session Design
- Root Layout and Fonts
- Scope and Delivery Rules
- Life Areas Repository
- Settings and Task Map Pages
- GoHa Core Concepts
- Visual Design Rules
- QA Test Suite
- Architecture and Data Rules
- Audit Findings and Fixes
- User Settings Repository
- Route Audit Spec
- Habits Data Model
- Test Account Script
- Package Manifest
- Auth Proxy Middleware
- Database Diagnostics Script
- Migration Runner Script
- Scaffold Icon Assets
- CVA Dependency
- Drizzle ORM Dependency
- Auth Setup Spec
- ESLint Config
- Motion Dependency
- Next Dependency
- Next Config
- React Dependency
- React DOM Dependency
- Server Only Dependency
- Sonner Dependency
- Tailwind Merge Dependency
- Zod Dependency
- Zustand Dependency
- Playwright Config
- PostCSS Config
- Scaffold Logo Assets
- Auth Client Exports

## God Nodes (most connected - your core abstractions)
1. `cn()` - 113 edges
2. `requireUser()` - 83 edges
3. `Button()` - 35 edges
4. `spring` - 19 edges
5. `getUserDatePrefs()` - 19 edges
6. `zonedToday()` - 18 edges
7. `GoHa Phased Build Plan` - 18 edges
8. `TasksView()` - 16 edges
9. `scripts` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `deriveTodayHabits()` --indirect_call--> `habit()`  [INFERRED]
  lib/habit-view.ts → tests/habit-view.test.ts
- `create-next-app Bootstrap README` --references--> `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)`  [AMBIGUOUS]
  README.md → CLAUDE.md
- `Surface Ramp Elevation (dark-first)` --semantically_similar_to--> `Tonal Layering with Ambient Shadows (paper stack)`  [INFERRED] [semantically similar]
  docs/DESIGN_SYSTEM.md → design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md
- `Manrope Type Scale (display 300 to label 600)` --semantically_similar_to--> `Apple Type Scale with Size-Dependent Tracking`  [INFERRED] [semantically similar]
  design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md → docs/GOHA_DESIGN_SPEC.md
- `Fixed-Fluid Hybrid Grid on an 8px Unit` --semantically_similar_to--> `The Proximity Law (group gap at least 3x inner gap)`  [INFERRED] [semantically similar]
  design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md → docs/GOHA_DESIGN_SPEC.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **MVP (V1a) delivery slices on one schema** — claude_mvp_v1a, docs_build_plan_phase_3_authentication, docs_build_plan_phase_4_life_areas, docs_build_plan_phase_5_goals, docs_build_plan_phase_6_tasks, docs_build_plan_phase_7_today_dashboard [EXTRACTED 1.00]
- **One connected system: canonical rows shared across surfaces** — claude_data_integrity, docs_database_tasks, docs_database_goals, docs_database_habit_entries, docs_database_daily_priorities, docs_database_derived_goal_progress [EXTRACTED 1.00]
- **The details that make the UI read as Apple rather than an imitation** — docs_goha_design_spec_label_opacity_system, docs_goha_design_spec_system_colors, docs_goha_design_spec_type_scale, docs_goha_design_spec_apple_springs, docs_goha_design_spec_layoutid_morph, docs_goha_design_spec_concentric_radius_rule, docs_goha_design_spec_glass_allowlist, docs_goha_design_spec_circular_checkbox [EXTRACTED 1.00]
- **GoHa App Shell Pattern** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_app_shell_nav, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_brain_dump_screen, design_stitch_goha_productivity_system_dashboard_calendar_schedule_code_calendar_screen, design_stitch_goha_productivity_system_dashboard_goals_management_code_goals_screen, design_stitch_goha_productivity_system_dashboard_habit_tracker_code_habits_screen, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_life_areas_screen, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_code_progress_screen, design_stitch_goha_productivity_system_dashboard_settings_preferences_code_settings_screen, design_stitch_goha_productivity_system_dashboard_task_map_explorer_code_task_map_screen, design_stitch_goha_productivity_system_dashboard_to_do_lists_code_todo_screen, design_stitch_goha_productivity_system_dashboard_today_dashboard_code_today_screen, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_code_review_screen [EXTRACTED 1.00]
- **Brain Dump Conversion Flow** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_capture_area, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_convert_actions, design_stitch_goha_productivity_system_dashboard_to_do_lists_code_task_card, design_stitch_goha_productivity_system_dashboard_goals_management_code_goal_card, design_stitch_goha_productivity_system_dashboard_habit_tracker_code_today_action_list, design_stitch_goha_productivity_system_dashboard_calendar_schedule_code_unified_day_timeline [INFERRED 0.85]
- **Life Score Computation Chain** — design_stitch_goha_productivity_system_dashboard_settings_preferences_code_life_score_weights, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_life_area_card, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_balance_score, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_code_life_score_gauge, design_stitch_goha_productivity_system_dashboard_today_dashboard_code_life_score_widget, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_code_week_summary [INFERRED 0.85]
- **Capture to persisted thought flow** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_capture_composer, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_dump_it_action, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_recent_thoughts_list, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_thought_card [INFERRED 0.85]
- **GoHa persistent app shell chrome** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_persistent_sidebar_nav, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_quick_action_button, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_global_top_bar, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_goha_navigation_map [EXTRACTED 1.00]
- **Calendar item taxonomy: events, habits, tasks and time blocks rendered as one agenda** — design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_event_detail_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_habit_agenda_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_task_agenda_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_timeblock_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_unified_schedule_model [EXTRACTED 1.00]
- **Calendar screen composition: nav shell, month grid card, and right-rail focus/agenda stack** — design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_sidebar_nav, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_calendar_nav_bar, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_month_grid, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_daily_focus_card, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_upcoming_panel [EXTRACTED 1.00]
- **Focus Timer Control Loop** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_countdown_timer_ring, design_stitch_goha_productivity_system_dashboard_focus_session_screen_timer_transport_controls, design_stitch_goha_productivity_system_dashboard_focus_session_screen_duration_preset_pills, design_stitch_goha_productivity_system_dashboard_focus_session_screen_complete_task_action [EXTRACTED 1.00]
- **Life Area to Goal to Task to Focus Context Chain** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_parent_goal_breadcrumb, design_stitch_goha_productivity_system_dashboard_focus_session_screen_active_task_title, design_stitch_goha_productivity_system_dashboard_focus_session_screen_task_map_step_indicator, design_stitch_goha_productivity_system_dashboard_focus_session_screen_countdown_timer_ring [INFERRED 0.85]
- **In-Session Capture Without Context Switch** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_feedback_notes_card, design_stitch_goha_productivity_system_dashboard_focus_session_screen_distraction_dump_card, design_stitch_goha_productivity_system_dashboard_focus_session_screen_distraction_free_layout_rationale [INFERRED 0.85]
- **Goal Card Progress Signalling Pattern** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_status_badge, design_stitch_goha_productivity_system_dashboard_goals_management_screen_progress_bar, design_stitch_goha_productivity_system_dashboard_goals_management_screen_card_metrics_row, design_stitch_goha_productivity_system_dashboard_goals_management_screen_overdue_due_date [INFERRED 0.85]
- **Multiple Goal Creation Entry Points** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_quick_action_button, design_stitch_goha_productivity_system_dashboard_goals_management_screen_add_goal_action, design_stitch_goha_productivity_system_dashboard_goals_management_screen_create_goal_placeholder [INFERRED 0.85]
- **App Shell Layout: Sidebar, Top Bar, Filtered Content Grid** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_sidebar_nav, design_stitch_goha_productivity_system_dashboard_goals_management_screen_top_bar, design_stitch_goha_productivity_system_dashboard_goals_management_screen_timeframe_tabs, design_stitch_goha_productivity_system_dashboard_goals_management_screen_goal_card_grid [EXTRACTED 1.00]
- **Habit logging feedback loop: check off, see today's ring move, see the week fill, see lifetime stats** — design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_action_list, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_today_ring, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_weekly_flow, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_stat_tiles [INFERRED 0.85]
- **Habit definition model: life area tag, linked goal, minimum/ideal thresholds, routine cadence** — design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_habit_detail_card, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_habit_goal_link, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_minimum_ideal, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_life_area_tag [INFERRED 0.85]
- **Life Area card anatomy: score, progress, and roll-up counts on a colour-coded card** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_life_score, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_area_progress_bar, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_goals_tasks_count_pill, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_area_color_coding [EXTRACTED 1.00]
- **Life balance KPI row aggregating scores, goals, and weekly tasks** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_overall_balance_score, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_total_active_goals, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_tasks_this_week, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_rollup_aggregation [INFERRED 0.85]
- **Global app chrome: brand lockup, sidebar nav with active state, and top bar quick actions** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_brand_lockup, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_sidebar_nav, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_topbar, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_active_nav_state [EXTRACTED 1.00]
- **Progress analytics surface: score, momentum insights, rollups and trends** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_gauge, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_strongest_area_card, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_needs_focus_card, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_trend_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart [EXTRACTED 1.00]
- **Life Score derived from task, habit, focus and goal activity across life areas** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_metric, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat [INFERRED 0.75]
- **Time range selection rescopes every metric on the page** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_time_range_toggle, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_trend_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat [INFERRED 0.85]
- **Settings page groups profile, system, appearance, scoring, and notification configuration into one card grid** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_profile_details_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_system_customization_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_appearance_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_score_balance_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_notifications_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_save_cancel_bar [EXTRACTED 1.00]
- **Sidebar, brand lockup, quick action, and top bar form the shared app shell chrome** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_app_shell_sidebar, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_brand_lockup, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_quick_action_button, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_nav_module_list, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_topbar [EXTRACTED 1.00]
- **Life area taxonomy defined once and consumed by the chip editor and the Life Score weighting sliders** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_area_taxonomy, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_manage_life_areas, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_score_balance_card [INFERRED 0.85]
- **Task map authoring surface (pick a map, view it, edit its nodes)** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_maps_explorer_panel, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_map_canvas, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_canvas_toolbar, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_view_edit_toggle [EXTRACTED 1.00]
- **Build, review, rework or advance conditional flow** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_active_node_state, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_decision_node, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_branch_edges, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_task_node_card [EXTRACTED 1.00]
- **Canvas object vocabulary: task, decision, annotation** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_task_node_card, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_decision_node, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_sticky_note, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_node_graph_editor_pattern [INFERRED 0.85]
- **Task Card Metadata Row Combines Priority, Goal, Life Area, and Schedule** — design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_task_card, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_priority_indicator, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_goal_chip, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_life_area_chip, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_scheduled_time [EXTRACTED 1.00]
- **Time Horizon Filtering Flow: Views Rail, Counts, Header, Upcoming Section** — design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_views_rail, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_view_count_badges, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_today_header, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_upcoming_section, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_date_derived_buckets [INFERRED 0.85]
- **Right rail ambient status cluster: score, schedule and habits read-at-a-glance** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_life_score_widget, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_upcoming_panel, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_habits_checklist, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_three_column_layout [EXTRACTED 1.00]
- **Execution funnel: capture, rank, commit to one task, then start a focus session** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_quick_add_task, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_top_3_actions, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_todays_focus_card, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_start_focus_session [INFERRED 0.85]
- **Daily ritual loop: greeting, habit ticks, reflection and score feedback** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_greeting_header, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_habits_checklist, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_evening_reflection, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_life_score_widget, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_day_arc_pattern [INFERRED 0.75]
- **Weekly Reflection Journaling Flow (three prompts culminating in Complete Review)** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_what_went_well_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_what_did_i_avoid_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_focus_next_week_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_complete_review_action [EXTRACTED 1.00]
- **Three-Step Weekly Review Ritual Checklist** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_process_inbox_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_review_goals_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_plan_next_week_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_review_flow_card [EXTRACTED 1.00]
- **Quantitative Week Snapshot (tasks, habits, life score trend)** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_tasks_completed_metric, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_habit_consistency_metric, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_life_score_trend, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_week_in_review_card [EXTRACTED 1.00]
- **Unmodified create-next-app default public/ asset set** — public_file_icon, public_globe_icon, public_next_logo, public_vercel_logo, public_window_icon [INFERRED 0.85]

## Communities (117 total, 22 thin omitted)

### Community 0 - "Task Map Server Actions"
Cohesion: 0.05
Nodes (75): ActionResult, addEdgeAction(), addNodeAction(), archiveTaskMapAction(), assertMapOwner(), createTaskMapAction(), deleteEdgeAction(), deleteNodeAction() (+67 more)

### Community 1 - "Calendar and Date Engine"
Cohesion: 0.06
Nodes (66): TaskCalendar(), addMonths(), buildMonthGrid(), CalendarDay, CalendarWeek, groupByDate(), MONTH_NAMES, monthLabel() (+58 more)

### Community 2 - "Brain Dump Actions and Pages"
Cohesion: 0.06
Nodes (32): ActionResult, archiveBrainDumpItemAction(), captureBrainDumpItemAction(), convertBrainDumpItemAction(), deleteBrainDumpItemAction(), restoreBrainDumpItemAction(), setBrainDumpColorAction(), updateBrainDumpItemAction() (+24 more)

### Community 3 - "Design Mockup Concepts"
Cohesion: 0.06
Nodes (54): App Shell Navigation, Brain Dump Screen, Quick Capture Area, Thought Conversion Actions, GoHa Design Tokens, Calendar Schedule Screen, Daily Focus Insight Card, Event Prep Subtasks (+46 more)

### Community 4 - "Goals Actions and Forms"
Cohesion: 0.09
Nodes (40): ActionResult, archiveGoalAction(), createGoalAction(), updateGoalAction(), validateReferences(), GoalDetailPanel(), FormProps, GoalFormFields() (+32 more)

### Community 5 - "Life Areas Module"
Cohesion: 0.11
Nodes (35): ActionResult, archiveLifeAreaAction(), createLifeAreaAction(), restoreLifeAreaAction(), updateLifeAreaAction(), LifeAreaIcon(), lifeAreaIconMap, LifeAreaCard() (+27 more)

### Community 6 - "Focus Session Actions"
Cohesion: 0.09
Nodes (37): ActionResult, discardFocusSessionAction(), endFocusSessionAction(), extendFocusSessionAction(), extendMinutesSchema, idSchema, noteSchema, pauseFocusSessionAction() (+29 more)

### Community 7 - "Task Cards and Detail Panel"
Cohesion: 0.09
Nodes (27): ActionResult, ActionButton(), TaskLifeAreaRef, TaskDetailBody(), TaskDetailHandlers, TaskDetailPanel(), toFormValues(), FormProps (+19 more)

### Community 8 - "Dev Dependencies"
Cohesion: 0.05
Nodes (37): drizzle-kit, eslint, eslint-config-next, jsdom, devDependencies, drizzle-kit, eslint, eslint-config-next (+29 more)

### Community 9 - "Habit Streak Engine"
Cohesion: 0.15
Nodes (27): NumericControl(), addDays(), startOfWeek(), weekdayOf(), computeHabitStreaks(), dayBasedStreaks(), EntryLike, entryOutcome() (+19 more)

### Community 10 - "App Shell Navigation"
Cohesion: 0.20
Nodes (17): LogoutButton(), AppHeader(), AppSidebar(), Brand(), BottomItem(), MobileBottomNav(), MobileHeader(), NavLink() (+9 more)

### Community 11 - "Auth and Priorities Schema"
Cohesion: 0.07
Nodes (24): account, session, verification, dailyPriorities, Account, DailyPriority, HabitSchedule, NewBrainDumpItem (+16 more)

### Community 12 - "Habit Forms and Week Grid"
Cohesion: 0.10
Nodes (24): ActionResult, FormProps, HabitFormFields(), HabitFormModal(), HabitGoalOption, HabitLifeAreaOption, scheduleTypeOf(), RowAction() (+16 more)

### Community 13 - "Task Map Workspace and Repo"
Cohesion: 0.08
Nodes (13): ArchivedRow(), ExplorerRow(), Graph, getTaskMap(), getTaskMapGraph(), TaskMapNodeInput, TaskMapNodeType, taskMapEdges (+5 more)

### Community 14 - "Today Dashboard Widgets"
Cohesion: 0.15
Nodes (22): ActiveGoalsCard(), TaskChecklistItem(), EmptyDay(), FocusCard(), OptimisticAction, PriorityChip(), PriorityChip(), TopPriorities() (+14 more)

### Community 15 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 16 - "Initial Schema Migration"
Cohesion: 0.15
Nodes (26): "account", "brain_dump_items", "daily_priorities", "focus_sessions", "goal_progress_updates", "goals", "habit_entries", "habit_schedules" (+18 more)

### Community 17 - "Database Schema Definitions"
Cohesion: 0.29
Nodes (12): user, BrainDumpConvertedType, BrainDumpStatus, HabitEntryStatus, HabitFrequency, HabitType, habitEntries, habitSchedules (+4 more)

### Community 18 - "Life Areas Dashboard Design"
Cohesion: 0.11
Nodes (26): Life Areas Dashboard Screen (Stitch design), Active Navigation State (Life Areas pill highlighted sage), Add Task Global Action (top bar, filled accent button), App Shell: Persistent Sidebar + Top Bar Layout, Per-Area Colour Coding (green Career/Growth, tan Health/Family, lavender Finance/Projects/Life Admin), Area Progress Bar (labelled track with trailing percentage), GoHa Brand Lockup: avatar, wordmark, 'Life Operating System' tagline, Compact Life Area Card variant (icon, name, big Life Score %, Goals and Tasks count pills) (+18 more)

### Community 19 - "Page Entry Points"
Cohesion: 0.14
Nodes (18): GoalsPage(), metadata, HabitsPage(), metadata, LifeAreasPage(), metadata, metadata, TodayPage() (+10 more)

### Community 20 - "Auth Form and Theme Settings"
Cohesion: 0.15
Nodes (16): updateThemeAction(), AuthForm(), loginSchema, registerSchema, AppearanceCard(), SettingsCard(), SettingsData, THEME_OPTIONS (+8 more)

### Community 21 - "Settings Screen Design"
Cohesion: 0.11
Nodes (24): Settings & Preferences Screen (GoHa Design Mockup), Persistent Left Sidebar Navigation, Appearance Card (Light/Dark theme previews, Match System Settings), Avatar with Change Photo Action, GoHa Brand Lockup (Life Operating System), Calm Neutral Card Visual Language (off-white canvas, white rounded cards, sage/amber accents), Default Focus Timers (Focus Session 25 min, Short Break 5 min), Display Name Field (+16 more)

### Community 22 - "Route Pages and Today Actions"
Cohesion: 0.17
Nodes (18): BrainDumpPage(), metadata, FocusPage(), metadata, AppLayout(), SettingsPage(), metadata, TasksPage() (+10 more)

### Community 23 - "Brain Dump and Focus Widgets"
Cohesion: 0.14
Nodes (18): BrainDumpItem(), CONVERT_ACTIONS, IconAction(), tiltFor(), DurationPicker(), Breakdown(), FocusStats(), FocusStatsData (+10 more)

### Community 24 - "Design System Lineage"
Cohesion: 0.10
Nodes (23): Fixed-Fluid Hybrid Grid on an 8px Unit, Intentional Calm Philosophy, Manrope Type Scale (display 300 to label 600), Serene Lifecycle Design System, Tonal Layering with Ambient Shadows (paper stack), Phase 0: Discovery and Design Audit, Nightshift Motion (springSnappy, springSmooth, easeOutExpo), Nightshift Design System (retired) (+15 more)

### Community 25 - "DB Client and Habits Repo"
Cohesion: 0.11
Nodes (11): createDb(), db, getDb(), getHabitSchedule(), HabitInput, HabitScheduleInput, listHabits(), listHabitsWithSchedule() (+3 more)

### Community 26 - "Goals Management Design"
Cohesion: 0.13
Nodes (22): Goals Management Screen (Stitch Design), Add Goal Primary Action, GoHa Brand Lockup: Life Operating System, Card Footer Metrics Row (task ratio, subgoal count, notes, due date), Per-Card Overflow Menu (kebab), Create New Goal Dashed Placeholder Card, Goal Breakdown Design Intent, Goal Card Component (+14 more)

### Community 28 - "Habit Server Actions"
Cohesion: 0.19
Nodes (17): archiveHabitAction(), createHabitAction(), habitColumns(), revalidateHabitSurfaces(), scheduleColumns(), updateHabitAction(), validateReferences(), HabitFieldErrors (+9 more)

### Community 29 - "Task Creation and Quick Add"
Cohesion: 0.18
Nodes (18): createTaskAction(), validateReferences(), TaskFormFields(), QuickAddTask(), manilaLocalToInstant(), zonedLocalToInstant(), completionNoteSchema, makeTaskFormSchema() (+10 more)

### Community 30 - "Task Actions and List View"
Cohesion: 0.19
Nodes (19): cancelTaskAction(), completeTaskAction(), createSubtaskAction(), deleteTaskAction(), reopenTaskAction(), revalidateTaskSurfaces(), saveCompletionNoteAction(), updateTaskAction() (+11 more)

### Community 31 - "To-Do Lists Design"
Cohesion: 0.14
Nodes (21): To-Do Lists Screen (Stitch Design), Task as Hub: Entry Points into Goals, Life Areas, Task Map, and Focus, Date Derived Time Buckets Instead of Static Bucket Fields, Density Progression: Focused Cards Now, Compact Rows Later, Global Navigation Sidebar (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings), Linked Goal Chip (Launch SaaS MVP, Investor Relations), Inline Add Task to Today Affordance, This Month / This Week Rail Labels Wrapping and Overflowing the Rail (+13 more)

### Community 32 - "Weekly Review Design"
Cohesion: 0.13
Nodes (21): Weekly Review & Reflection Screen (Stitch Design), GoHa App Shell (Sidebar + Top Bar Layout), Complete Review Submit Action, Visual Language: warm cream canvas, white rounded cards, sage green accent, semantic icon colours (amber sun, red warning), Reflection Prompt: Focus for next week? (top 3 core intentions), Habit Consistency Metric (85% with progress bar), Life Score Trend Bar Chart (5 weekly bars, current 9.2 highlighted), Review Step: Plan Next Week (time-block major priorities) (+13 more)

### Community 33 - "Settings Actions and Timezones"
Cohesion: 0.17
Nodes (16): ActionResult, updatePreferencesAction(), updateProfileAction(), PreferencesCard(), ProfileCard(), DEFAULT_TIMEZONE, isValidTimeZone(), TIMEZONE_OPTIONS (+8 more)

### Community 34 - "Goals Repository"
Cohesion: 0.11
Nodes (10): collectAncestorIds(), getGoal(), GoalInput, GoalUpdate, NOTE: an earlier version used correlated subqueries, GoalProgressMode, GoalStatus, GoalTimeframe (+2 more)

### Community 35 - "Today Dashboard Design"
Cohesion: 0.19
Nodes (19): Today Dashboard Screen (Stitch design), GoHa Brand Lockup and Life Operating System Tagline, Full Day Arc: morning greeting through evening reflection on one surface, Evening Reflection Entry Point, Time of Day Greeting and Date Header, Habits Checklist Widget, Life Score Ring Widget (82%), Navigation Module Set (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings) (+11 more)

### Community 36 - "Habit Logging Controls"
Cohesion: 0.22
Nodes (13): clearHabitEntryAction(), logHabitEntryAction(), HabitLogControl(), LogHabit, LogInput, EntryAction, HabitsView(), EntryAction (+5 more)

### Community 37 - "shadcn Component Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 38 - "Dropdown and Tooltip Primitives"
Cohesion: 0.12
Nodes (15): Dropdown(), DropdownItem, isSelectable(), Side, sidePosition, Tooltip(), durations, easeOutExpo (+7 more)

### Community 39 - "Calendar Screen Design"
Cohesion: 0.16
Nodes (18): Calendar Schedule Screen (GoHa design mockup), App Shell: persistent sidebar + top bar layout, Calendar Header: month title, prev/Today/next stepper, Month|Week|Day segmented control, Daily Focus Card with narrative summary and progress bar, Day-cell Event Chips (colour-coded by item type; strikethrough = completed), Event Agenda Item with nested prep-task checklist (Job Interview - Acme Corp, 10:00 AM, Video Call), Habit Agenda Item (Read 20 pages, 'Habit - Anytime', repeat icon), Month Grid (Sun-Sat, 6 rows, leading/trailing days muted) (+10 more)

### Community 40 - "Auth Routes and Pages"
Cohesion: 0.18
Nodes (11): { GET, POST }, LoginPage(), metadata, metadata, RegisterPage(), Database, schema, auth (+3 more)

### Community 41 - "Tech Stack and Early Phases"
Cohesion: 0.14
Nodes (16): Next.js Agent Rules (breaking-change warning), GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth), Sage Blue-Green Accent with Earth-Tone Categories, Neon authenticator-role Credential Blocker, Phase 3: Authentication (Better Auth), Phase 4: Life Areas, life_areas table, user table (Better Auth account record) (+8 more)

### Community 42 - "Goal and Task Card Components"
Cohesion: 0.23
Nodes (12): GoalCard(), LifeAreaRef, GoalDetailBody(), HabitsWeekGrid(), TaskCard(), DetailPanel(), DetailRow(), GoalWithCounts (+4 more)

### Community 43 - "Progress Analytics Design"
Cohesion: 0.17
Nodes (16): Life Score / Progress Analytics Screen (Stitch design), Rounded Card Grid Layout Pattern, Focus Sessions Stat Tile (12 completed), Goals Advanced Stat Tile (3 moved forward), Life Area Colour and Icon Coding, Life Score Radial Gauge (78, 'Strong', +4 from last month), Life Score Composite Metric, Life Score Trend Area/Line Chart (Weeks 1-4, 50-100 axis) (+8 more)

### Community 44 - "Task Map Explorer Design"
Cohesion: 0.18
Nodes (16): Task Map Explorer Screen (Stitch design), Active Nav Item Treatment (Task Map selected), Active Node State with Inline Progress, Labelled Yes / No Branch Edges, Floating Canvas Toolbar, Dashboard Redesign (example task map), Decision Node (hexagon), Focus Mode Entry Point from Task Map (+8 more)

### Community 45 - "Package Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, db:diagnose, db:generate, db:migrate, db:push, db:studio, dev (+8 more)

### Community 46 - "Focus Sessions Repository"
Cohesion: 0.14
Nodes (4): startFocusSession(), FocusSessionStatus, focusSessions, manilaToday()

### Community 47 - "Tasks Repository"
Cohesion: 0.13
Nodes (3): TaskInput, Priority, TaskStatus

### Community 48 - "Habit Tracker Design"
Cohesion: 0.24
Nodes (15): Habits & Routines Screen (Stitch design), Action List Card (checkable habits tagged by life area), Two-Column Card Grid on Off-White Canvas, Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence), Habit-to-Goal Linkage (Goal: Launch MVP), Life Area Colour Tag (Mind / Career / Growth dot pills), Minimum / Ideal Threshold Pattern, Page Header 'Build systems, not just goals.' with Current Streak Badge (+7 more)

### Community 49 - "Feature Phase Notes"
Cohesion: 0.20
Nodes (15): Atomic Writable-CTE Brain Dump Conversion, listGoalsWithTaskCounts Correlated-Subquery Bug, Phase 10: Brain Dump, Phase 11: Task Maps (React Flow), Phase 5: Goals with Hierarchy and Progress, Phase 7: Today Dashboard, brain_dump_items table (polymorphic conversion), daily_priorities table (Top 3 per day) (+7 more)

### Community 50 - "Brain Dump Capture Design"
Cohesion: 0.19
Nodes (14): Brain Dump Quick Capture Screen (design mockup), Image and Voice Attachment Affordances, Brain Dump Module, Capture Composer Textarea, Dump It Submit Action, Frictionless Capture Principle, Global Top Bar (search, Focus Mode, Add Task, theme, avatar), GoHa Navigation Map (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings) (+6 more)

### Community 51 - "Runtime Dependencies"
Cohesion: 0.15
Nodes (13): better-auth, clsx, lucide-react, @neondatabase/serverless, next-themes, dependencies, better-auth, clsx (+5 more)

### Community 52 - "Focus Session Design"
Cohesion: 0.26
Nodes (13): Focus Session Screen (Stitch design), Active Task: Finalize Q4 Presentation, Complete Task Action (checkmark), Circular Countdown Timer with Progress Ring (24:15), Distraction Dump Card, Distraction-Free Single-Purpose Layout, Duration Preset Pills (15/25/45/60 min plus custom), Feedback Notes Card (+5 more)

### Community 53 - "Root Layout and Fonts"
Cohesion: 0.21
Nodes (7): geistMono, inter, metadata, viewport, MotionProvider(), ThemeProvider(), Toaster()

### Community 54 - "Scope and Delivery Rules"
Cohesion: 0.24
Nodes (11): Expansion (V1b) Scope, MVP (V1a) Scope, Out of Scope for GoHa (no AI, automations, billing), Working Style and Quality Gates, Two-Stage Delivery on One Complete Schema, Phase 12: Calendar, Review, Progress (not started), Phase 13: Settings and Polish Pass, Phase 1: Scaffold and App Shell (+3 more)

### Community 55 - "Life Areas Repository"
Cohesion: 0.18
Nodes (3): LifeAreaInput, goals, habits

### Community 56 - "Settings and Task Map Pages"
Cohesion: 0.24
Nodes (7): metadata, metadata, TaskMapsPage(), PageHeader(), SettingsView(), taskMapsRepo, tasksRepo

### Community 57 - "GoHa Core Concepts"
Cohesion: 0.22
Nodes (10): GoHa Conceptual Chain (Life Area to Reflect), One Connected System (no duplicate dashboard data), GoHa (Goals, Habits, and ACTION), Asia/Manila Timezone Rules, Date-Derived Task Views (no stored bucket), Phase 6: Tasks / To-dos, The Connected Chain (user to task maps), Database Constraints as the Second Integrity Layer (+2 more)

### Community 58 - "Visual Design Rules"
Cohesion: 0.20
Nodes (10): UI States and Design Fidelity Rules, Reserved Electric Cyan Accent (light equals meaning), Today as the Reference Screen, Violet Secondary for Progress and Data, 44x44 Minimum Tap Target, Glass on Chrome Only, Never on Rows, Liquid Glass Material Tiers (blur plus saturate 180%), Mandatory Reduced-Transparency and @supports Fallbacks (+2 more)

### Community 59 - "QA Test Suite"
Cohesion: 0.20
Nodes (4): consoleProblems, Finding, findings, IGNORED

### Community 60 - "Architecture and Data Rules"
Cohesion: 0.31
Nodes (9): Architecture Rules (Server Components, Server Actions), UUID Identifiers and Drizzle Kit Migration Rules, Repository Layer Seam under db/, Session-Derived Identity and User Scoping, db:diagnose Read-Only Health Check, Phase 2: Full Database Schema and Repository Seam, db/ Data-Access Seam (client, schema, types, repositories), Drizzle Kit Migrations (db/migrations) (+1 more)

### Community 61 - "Audit Findings and Fixes"
Cohesion: 0.22
Nodes (9): e2e/audit.spec.ts Browser-Driven Route Audit, Focus Duration Derived from Timestamps, Focus startSchema optional-vs-nullish Bug, ThemeToggle Hydration Mismatch (perceived lag), Phase 9: Focus Mode, Single-Owner Account Enforcement, Isolated Test Account Harness (test:account:create), focus_sessions table (+1 more)

### Community 62 - "User Settings Repository"
Cohesion: 0.29
Nodes (6): getOrCreateUserSettings(), getUserSettings(), UserSettingsInput, ThemePreference, userSettings, UserSettings

### Community 63 - "Route Audit Spec"
Cohesion: 0.29
Nodes (7): IGNORED, Problem, problems, ROUTES, timings, visit(), watch()

### Community 64 - "Habits Data Model"
Cohesion: 0.60
Nodes (5): Schedule-Aware Habit Streak Engine, Phase 8: Habits, habit_entries table (one log per habit per local date), habit_schedules table, habits table (boolean or numeric)

### Community 65 - "Test Account Script"
Cohesion: 0.40
Nodes (3): sql, TEST_EMAIL, TEST_PASSWORD

### Community 66 - "Package Manifest"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 71 - "Scaffold Icon Assets"
Cohesion: 1.00
Nodes (3): File/Document Icon (Next.js scaffold asset), Globe/World Icon (Next.js scaffold asset), Browser Window Icon (Next.js scaffold asset)

## Ambiguous Edges - Review These
- `create-next-app Bootstrap README` → `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)`  [AMBIGUOUS]
  README.md · relation: references
- `Event Prep Subtasks` → `Task Card`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/calendar_schedule/code.html · relation: conceptually_related_to
- `Thought Card with Relative Timestamp` → `Section Item Count Indicator`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/brain_dump_quick_capture/screen.png · relation: shares_data_with
- `Parent Goal Breadcrumb: Launch SaaS MVP` → `Distraction-Free Single-Purpose Layout`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/focus_session/screen.png · relation: conceptually_related_to
- `Goal Status Badge (In Progress, On Track, At Risk, Not Started)` → `Overdue Due Date Emphasis (red Oct 15)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/goals_management/screen.png · relation: conceptually_related_to
- `Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence)` → `Weekly Flow Grid (habits x weekdays, Done/Partial/Missed)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/habit_tracker/screen.png · relation: shares_data_with
- `Primary Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` → `Focus Mode Entry Point (top bar)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/life_areas_dashboard/screen.png · relation: conceptually_related_to
- `Goals Advanced Stat Tile (3 moved forward)` → `Persistent Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/life_score_progress_analytics/screen.png · relation: shares_data_with
- `Module Nav Items (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` → `Life Area Taxonomy (Career, Health, Relationships, Personal Growth)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/settings_preferences/screen.png · relation: conceptually_related_to
- `Views Rail: Inbox, Today, This Week, This Month, Quarterly, Yearly, Done` → `This Month / This Week Rail Labels Wrapping and Overflowing the Rail`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/to_do_lists/screen.png · relation: references
- `Navigation Module Set (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` → `Upcoming Schedule Panel`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/today_dashboard/screen.png · relation: shares_data_with
- `Life Score Trend Bar Chart (5 weekly bars, current 9.2 highlighted)` → `Visual Language: warm cream canvas, white rounded cards, sage green accent, semantic icon colours (amber sun, red warning)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/weekly_review_reflection/screen.png · relation: conceptually_related_to
- `Review Flow Checklist Card (Process Inbox, Review Goals, Plan Next Week)` → `Complete Review Submit Action`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/weekly_review_reflection/screen.png · relation: conceptually_related_to

## Knowledge Gaps
- **310 isolated node(s):** `ActionResult`, `metadata`, `metadata`, `ActionResult`, `idSchema` (+305 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `create-next-app Bootstrap README` and `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Event Prep Subtasks` and `Task Card`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Thought Card with Relative Timestamp` and `Section Item Count Indicator`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Parent Goal Breadcrumb: Launch SaaS MVP` and `Distraction-Free Single-Purpose Layout`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Goal Status Badge (In Progress, On Track, At Risk, Not Started)` and `Overdue Due Date Emphasis (red Oct 15)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence)` and `Weekly Flow Grid (habits x weekdays, Done/Partial/Missed)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Primary Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` and `Focus Mode Entry Point (top bar)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._