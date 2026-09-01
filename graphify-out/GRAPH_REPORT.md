# Graph Report - C:\Users\Mark\GoHa App  (2026-09-01)

## Corpus Check
- 31 files · ~655,651 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3237 nodes · 7625 edges · 207 communities (178 shown, 29 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 200 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Domain logic
- Domain logic
- Domain logic
- UI components
- Domain logic
- Domain logic
- UI components
- UI components
- Design references
- Domain logic
- Database layer
- Database layer
- Database layer
- Domain logic
- App routes
- Package.Json: Package.Json
- Domain logic
- Domain logic
- Database layer
- Domain logic
- Package.Json: Package.Json
- Database layer
- Database layer
- App routes
- App routes
- App routes
- Domain logic
- Database layer
- UI components
- App routes
- Domain logic
- Domain logic
- Tsconfig.Json: Tsconfig.Json
- App routes
- UI components
- Domain logic
- App routes
- UI components
- Database layer
- Domain logic
- Domain logic
- Domain logic
- Domain logic
- UI components
- Domain logic
- Database layer
- Domain logic
- Package.Json: Package.Json
- Design references
- Domain logic
- Domain logic
- App routes
- Database layer
- Database layer
- Documentation
- Domain logic
- Domain logic
- Domain logic
- Documentation
- Test suite
- Domain logic
- App routes
- Design references
- App routes
- App routes
- UI components
- Database layer
- Design references
- Design references
- Tooling scripts
- Tooling scripts
- Domain logic
- Components.Json: Components.Json
- Tooling scripts
- Design references
- App routes
- App routes
- Domain logic
- UI components
- Design references
- Design references
- Domain logic
- Domain logic
- Database layer
- Design references
- Design references
- Domain logic
- Test suite
- Domain logic
- Domain logic
- Database layer
- App routes
- Design references
- Documentation
- Test suite
- Design references
- Design references
- Domain logic
- Database layer
- Database layer
- Database layer
- Test suite
- Design references
- Documentation
- UI components
- Documentation
- UI components
- UI components
- Test suite
- Documentation
- Database layer
- End-to-end tests
- Tooling scripts
- Tooling scripts
- App routes
- Domain logic
- Database layer
- Database layer
- End-to-end tests
- Package.Json: Package.Json
- UI components
- Documentation
- Domain logic
- Tooling scripts
- Tooling scripts
- Tooling scripts
- Test suite
- Test suite
- Claude.Md: Claude.Md
- Vercel.Json: Vercel.Json
- UI components
- End-to-end tests
- Proxy.Ts: Proxy.Ts
- Test suite
- Test suite
- Test suite
- Test suite
- Test suite
- Database layer
- Documentation
- Next.Config.Ts: Next.Config.Ts
- Static assets
- Test suite
- Test suite
- Database layer
- Database layer
- Database layer
- Static assets
- Test suite
- App routes
- App routes
- App routes
- App routes
- App routes
- App routes
- Postcss.Config.Mjs: Postcss.Config.Mjs
- Static assets
- Community 174
- Database layer
- Database layer
- Database layer
- Database layer
- Database layer
- Database layer
- Community 191
- Community 195
- Community 197
- Community 202
- Community 203
- Community 204

## God Nodes (most connected - your core abstractions)
1. `cn()` - 164 edges
2. `addDays()` - 52 edges
3. `Button()` - 51 edges
4. `requireUser()` - 49 edges
5. `zonedToday()` - 47 edges
6. `startOfWeek()` - 39 edges
7. `authenticateAutomation()` - 38 edges
8. `getUserDatePrefs()` - 36 edges
9. `IsoDate` - 33 edges
10. `Weekday` - 33 edges

## Surprising Connections (you probably didn't know these)
- `create-next-app Bootstrap README` --references--> `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)`  [AMBIGUOUS]
  README.md → CLAUDE.md
- `Manrope Type Scale (display 300 to label 600)` --semantically_similar_to--> `Apple Type Scale with Size-Dependent Tracking`  [INFERRED] [semantically similar]
  design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md → docs/GOHA_DESIGN_SPEC.md
- `Surface Ramp Elevation (dark-first)` --semantically_similar_to--> `Tonal Layering with Ambient Shadows (paper stack)`  [INFERRED] [semantically similar]
  docs/DESIGN_SYSTEM.md → design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md
- `Fixed-Fluid Hybrid Grid on an 8px Unit` --semantically_similar_to--> `The Proximity Law (group gap at least 3x inner gap)`  [INFERRED] [semantically similar]
  design/stitch_goha_productivity_system_dashboard/serene_lifecycle/DESIGN.md → docs/GOHA_DESIGN_SPEC.md
- `ActionButton()` --calls--> `cn()`  [EXTRACTED]
  components/tasks/task-card.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **The details that make the UI read as Apple rather than an imitation** — docs_goha_design_spec_label_opacity_system, docs_goha_design_spec_system_colors, docs_goha_design_spec_type_scale, docs_goha_design_spec_apple_springs, docs_goha_design_spec_layoutid_morph, docs_goha_design_spec_concentric_radius_rule, docs_goha_design_spec_glass_allowlist, docs_goha_design_spec_circular_checkbox [EXTRACTED 1.00]
- **Calendar item taxonomy: events, habits, tasks and time blocks rendered as one agenda** — design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_event_detail_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_habit_agenda_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_task_agenda_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_timeblock_item, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_unified_schedule_model [EXTRACTED 1.00]
- **Calendar screen composition: nav shell, month grid card, and right-rail focus/agenda stack** — design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_sidebar_nav, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_calendar_nav_bar, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_month_grid, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_daily_focus_card, design_stitch_goha_productivity_system_dashboard_calendar_schedule_screen_upcoming_panel [EXTRACTED 1.00]
- **Build, review, rework or advance conditional flow** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_active_node_state, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_decision_node, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_branch_edges, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_task_node_card [EXTRACTED 1.00]
- **Sidebar, brand lockup, quick action, and top bar form the shared app shell chrome** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_app_shell_sidebar, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_brand_lockup, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_quick_action_button, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_nav_module_list, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_topbar [EXTRACTED 1.00]
- **Settings page groups profile, system, appearance, scoring, and notification configuration into one card grid** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_profile_details_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_system_customization_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_appearance_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_score_balance_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_notifications_card, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_save_cancel_bar [EXTRACTED 1.00]
- **Focus Timer Control Loop** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_countdown_timer_ring, design_stitch_goha_productivity_system_dashboard_focus_session_screen_timer_transport_controls, design_stitch_goha_productivity_system_dashboard_focus_session_screen_duration_preset_pills, design_stitch_goha_productivity_system_dashboard_focus_session_screen_complete_task_action [EXTRACTED 1.00]
- **Global app chrome: brand lockup, sidebar nav with active state, and top bar quick actions** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_brand_lockup, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_topbar, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_active_nav_state [EXTRACTED 1.00]
- **App Shell Layout: Sidebar, Top Bar, Filtered Content Grid** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_top_bar, design_stitch_goha_productivity_system_dashboard_goals_management_screen_timeframe_tabs, design_stitch_goha_productivity_system_dashboard_goals_management_screen_goal_card_grid [EXTRACTED 1.00]
- **GoHa persistent app shell chrome** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_persistent_sidebar_nav, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_global_top_bar, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_goha_navigation_map [EXTRACTED 1.00]
- **GoHa App Shell Pattern** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_app_shell_nav, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_brain_dump_screen, design_stitch_goha_productivity_system_dashboard_calendar_schedule_code_calendar_screen, design_stitch_goha_productivity_system_dashboard_goals_management_code_goals_screen, design_stitch_goha_productivity_system_dashboard_habit_tracker_code_habits_screen, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_life_areas_screen, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_code_progress_screen, design_stitch_goha_productivity_system_dashboard_settings_preferences_code_settings_screen, design_stitch_goha_productivity_system_dashboard_task_map_explorer_code_task_map_screen, design_stitch_goha_productivity_system_dashboard_to_do_lists_code_todo_screen, design_stitch_goha_productivity_system_dashboard_today_dashboard_code_today_screen, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_code_review_screen [EXTRACTED 1.00]
- **One connected system: canonical rows shared across surfaces** — claude_data_integrity, docs_database_tasks, docs_database_goals, docs_database_habit_entries, docs_database_daily_priorities, docs_database_derived_goal_progress [EXTRACTED 1.00]
- **MVP (V1a) delivery slices on one schema** — claude_mvp_v1a, docs_build_plan_phase_3_authentication, docs_build_plan_phase_4_life_areas, docs_build_plan_phase_5_goals, docs_build_plan_phase_6_tasks, docs_build_plan_phase_7_today_dashboard [EXTRACTED 1.00]
- **Life Area card anatomy: score, progress, and roll-up counts on a colour-coded card** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_life_score, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_area_progress_bar, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_goals_tasks_count_pill, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_area_color_coding [EXTRACTED 1.00]
- **Progress analytics surface: score, momentum insights, rollups and trends** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_gauge, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_strongest_area_card, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_needs_focus_card, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_trend_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart [EXTRACTED 1.00]
- **Task map authoring surface (pick a map, view it, edit its nodes)** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_maps_explorer_panel, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_map_canvas, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_canvas_toolbar, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_view_edit_toggle [EXTRACTED 1.00]
- **Right rail ambient status cluster: score, schedule and habits read-at-a-glance** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_life_score_widget, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_upcoming_panel, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_habits_checklist, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_three_column_layout [EXTRACTED 1.00]
- **Task Card Metadata Row Combines Priority, Goal, Life Area, and Schedule** — design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_task_card, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_priority_indicator, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_goal_chip, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_life_area_chip, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_scheduled_time [EXTRACTED 1.00]
- **Quantitative Week Snapshot (tasks, habits, life score trend)** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_tasks_completed_metric, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_habit_consistency_metric, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_life_score_trend, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_week_in_review_card [EXTRACTED 1.00]
- **Weekly Reflection Journaling Flow (three prompts culminating in Complete Review)** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_what_went_well_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_what_did_i_avoid_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_focus_next_week_prompt, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_complete_review_action [EXTRACTED 1.00]
- **Three-Step Weekly Review Ritual Checklist** — design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_process_inbox_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_review_goals_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_plan_next_week_step, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_screen_review_flow_card [EXTRACTED 1.00]
- **Life Score derived from task, habit, focus and goal activity across life areas** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_metric, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat [INFERRED 0.75]
- **Daily ritual loop: greeting, habit ticks, reflection and score feedback** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_greeting_header, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_habits_checklist, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_evening_reflection, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_life_score_widget, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_day_arc_pattern [INFERRED 0.75]
- **Capture to persisted thought flow** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_capture_composer, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_dump_it_action, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_recent_thoughts_list, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_screen_thought_card [INFERRED 0.85]
- **Brain Dump Conversion Flow** — design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_capture_area, design_stitch_goha_productivity_system_dashboard_brain_dump_quick_capture_code_convert_actions, design_stitch_goha_productivity_system_dashboard_to_do_lists_code_task_card, design_stitch_goha_productivity_system_dashboard_goals_management_code_goal_card, design_stitch_goha_productivity_system_dashboard_habit_tracker_code_today_action_list, design_stitch_goha_productivity_system_dashboard_calendar_schedule_code_unified_day_timeline [INFERRED 0.85]
- **Canvas object vocabulary: task, decision, annotation** — design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_task_node_card, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_decision_node, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_sticky_note, design_stitch_goha_productivity_system_dashboard_task_map_explorer_screen_node_graph_editor_pattern [INFERRED 0.85]
- **Unmodified create-next-app default public/ asset set** — public_file_icon, public_globe_icon, public_next_logo, public_vercel_logo, public_window_icon [INFERRED 0.85]
- **Life area taxonomy defined once and consumed by the chip editor and the Life Score weighting sliders** — design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_area_taxonomy, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_manage_life_areas, design_stitch_goha_productivity_system_dashboard_settings_preferences_screen_life_score_balance_card [INFERRED 0.85]
- **Life Area to Goal to Task to Focus Context Chain** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_parent_goal_breadcrumb, design_stitch_goha_productivity_system_dashboard_focus_session_screen_active_task_title, design_stitch_goha_productivity_system_dashboard_focus_session_screen_task_map_step_indicator, design_stitch_goha_productivity_system_dashboard_focus_session_screen_countdown_timer_ring [INFERRED 0.85]
- **Goal Card Progress Signalling Pattern** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_status_badge, design_stitch_goha_productivity_system_dashboard_goals_management_screen_progress_bar, design_stitch_goha_productivity_system_dashboard_goals_management_screen_card_metrics_row, design_stitch_goha_productivity_system_dashboard_goals_management_screen_overdue_due_date [INFERRED 0.85]
- **Multiple Goal Creation Entry Points** — design_stitch_goha_productivity_system_dashboard_goals_management_screen_quick_action_button, design_stitch_goha_productivity_system_dashboard_goals_management_screen_add_goal_action, design_stitch_goha_productivity_system_dashboard_goals_management_screen_create_goal_placeholder [INFERRED 0.85]
- **Habit definition model: life area tag, linked goal, minimum/ideal thresholds, routine cadence** — design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_habit_detail_card, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_habit_goal_link, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_minimum_ideal, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_life_area_tag [INFERRED 0.85]
- **Habit logging feedback loop: check off, see today's ring move, see the week fill, see lifetime stats** — design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_action_list, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_today_ring, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_weekly_flow, design_stitch_goha_productivity_system_dashboard_habit_tracker_screen_stat_tiles [INFERRED 0.85]
- **In-Session Capture Without Context Switch** — design_stitch_goha_productivity_system_dashboard_focus_session_screen_feedback_notes_card, design_stitch_goha_productivity_system_dashboard_focus_session_screen_distraction_dump_card, design_stitch_goha_productivity_system_dashboard_focus_session_screen_distraction_free_layout_rationale [INFERRED 0.85]
- **Life balance KPI row aggregating scores, goals, and weekly tasks** — design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_overall_balance_score, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_total_active_goals, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_tasks_this_week, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_screen_rollup_aggregation [INFERRED 0.85]
- **Life Score Computation Chain** — design_stitch_goha_productivity_system_dashboard_settings_preferences_code_life_score_weights, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_life_area_card, design_stitch_goha_productivity_system_dashboard_life_areas_dashboard_code_balance_score, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_code_life_score_gauge, design_stitch_goha_productivity_system_dashboard_today_dashboard_code_life_score_widget, design_stitch_goha_productivity_system_dashboard_weekly_review_reflection_code_week_summary [INFERRED 0.85]
- **Time range selection rescopes every metric on the page** — design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_time_range_toggle, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_life_score_trend_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_task_habit_completion_chart, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_focus_sessions_stat, design_stitch_goha_productivity_system_dashboard_life_score_progress_analytics_screen_goals_advanced_stat [INFERRED 0.85]
- **Execution funnel: capture, rank, commit to one task, then start a focus session** — design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_quick_add_task, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_top_3_actions, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_todays_focus_card, design_stitch_goha_productivity_system_dashboard_today_dashboard_screen_start_focus_session [INFERRED 0.85]
- **Time Horizon Filtering Flow: Views Rail, Counts, Header, Upcoming Section** — design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_views_rail, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_view_count_badges, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_today_header, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_upcoming_section, design_stitch_goha_productivity_system_dashboard_to_do_lists_screen_date_derived_buckets [INFERRED 0.85]

## Communities (207 total, 29 thin omitted)

### Community 0 - "Domain logic"
Cohesion: 0.05
Nodes (63): ActionResult, saveTakeawayAction(), TakeawayComposer(), IsoDate, getDailyInspiration(), FALLBACK_POOL, pickFallback(), QUOTES (+55 more)

### Community 1 - "Domain logic"
Cohesion: 0.05
Nodes (42): ActionResult, archiveBrainDumpItemAction(), captureBrainDumpItemAction(), convertBrainDumpItemAction(), deleteBrainDumpItemAction(), restoreBrainDumpItemAction(), setBrainDumpColorAction(), updateBrainDumpItemAction() (+34 more)

### Community 2 - "Domain logic"
Cohesion: 0.07
Nodes (50): ActionResult, archiveGoalAction(), createGoalAction(), revalidateGoalSurfaces(), updateGoalAction(), validateReferences(), GoalDetailView(), GoalProgressEntry (+42 more)

### Community 3 - "UI components"
Cohesion: 0.08
Nodes (35): metadata, LogoutButton(), BarSeries(), SeriesPoint, Sparkline(), ChartDataTable(), TableRow, TabButton() (+27 more)

### Community 4 - "Domain logic"
Cohesion: 0.06
Nodes (54): App Shell Navigation, Brain Dump Screen, Quick Capture Area, Thought Conversion Actions, GoHa Design Tokens, Calendar Schedule Screen, Daily Focus Insight Card, Event Prep Subtasks (+46 more)

### Community 5 - "Domain logic"
Cohesion: 0.08
Nodes (43): CalendarPage(), weekdayOf(), countsTowardExpected(), DayCellStateName, HabitMeasure, HabitOutcome, HabitOutcomeInput, isCompleteOutcome() (+35 more)

### Community 6 - "UI components"
Cohesion: 0.08
Nodes (40): HabitsPage(), metadata, metadata, metadata, TodayPage(), DateRolloverRefresh(), addMonths(), contextWeekStart() (+32 more)

### Community 7 - "UI components"
Cohesion: 0.10
Nodes (37): cancelTaskAction(), completeTaskAction(), createSubtaskAction(), createTaskAction(), deleteTaskAction(), goalJustCompleted(), reopenTaskAction(), revalidateTaskSurfaces() (+29 more)

### Community 8 - "Design references"
Cohesion: 0.07
Nodes (32): updateAutomationPrefsAction(), updatePreferencesAction(), updateProfileAction(), updateRhythmAction(), updateThemeAction(), ActionResult, ArchivedItem, ArchivedKind (+24 more)

### Community 9 - "Domain logic"
Cohesion: 0.17
Nodes (25): account, session, user, verification, brainDumpItems, BrainDumpConvertedType, BrainDumpStatus, GoalProgressMode (+17 more)

### Community 10 - "Database layer"
Cohesion: 0.09
Nodes (30): ActionResult, TaskRow(), CompletionNoteModal(), SubtaskTitle(), TaskDetailBody(), TaskDetailHandlers, TaskTitleField(), toFormValues() (+22 more)

### Community 11 - "Database layer"
Cohesion: 0.05
Nodes (39): better-auth, class-variance-authority, clsx, drizzle-orm, lucide-react, motion, @neondatabase/serverless, next (+31 more)

### Community 12 - "Database layer"
Cohesion: 0.13
Nodes (29): dynamic, POST(), readClaimBody(), runtime, dynamic, POST(), runtime, dynamic (+21 more)

### Community 13 - "Domain logic"
Cohesion: 0.08
Nodes (33): PushDelivery, PushSubscriptionRecord, ValidatedPushEndpoint, createPushSender(), decodedBase64Url(), DEFAULT_PUSH_TTL_SECONDS, defaultSender, ignoreMutationFailure() (+25 more)

### Community 14 - "App routes"
Cohesion: 0.08
Nodes (21): metadata, metadata, COMMON, loginSchema, PasswordMeter(), registerSchema, scorePassword(), ForgotPasswordForm() (+13 more)

### Community 15 - "Package.Json: Package.Json"
Cohesion: 0.08
Nodes (32): dbNodeToFlow(), EDGE_OPTIONS, GohaNode, GohaNodeData, GohaNodeView(), ImportTasksDialog(), LegendEditor(), LegendKey() (+24 more)

### Community 16 - "Domain logic"
Cohesion: 0.10
Nodes (34): "account", "brain_dump_items", "daily_priorities", "focus_sessions", "goal_progress_updates", "goals", "habit_entries", "habit_schedules" (+26 more)

### Community 17 - "Domain logic"
Cohesion: 0.05
Nodes (36): Account, AutomationJob, DailyInspirationRow, NewAutomationJob, NewAutomationRequest, NewAutomationToken, NewBrainDumpItem, NewDailyInspiration (+28 more)

### Community 18 - "Database layer"
Cohesion: 0.12
Nodes (29): ActionResult, clearPairingCookie(), createPushPairingAction(), endpointInputSchema, getCurrentPushStateAction(), getStagedPairingStateAction(), listPushOverviewAction(), presentedPairingHash() (+21 more)

### Community 19 - "Domain logic"
Cohesion: 0.06
Nodes (36): drizzle-kit, eslint, eslint-config-next, jsdom, devDependencies, drizzle-kit, eslint, eslint-config-next (+28 more)

### Community 20 - "Package.Json: Package.Json"
Cohesion: 0.13
Nodes (25): Celebration(), CONFIG, Milestone, PARTICLES, ActiveGoalsCard(), DailyInspirationCard(), DailyInspirationView, PROVIDER_CREDIT (+17 more)

### Community 21 - "Database layer"
Cohesion: 0.06
Nodes (10): automationRequests, automationTokens, dailyQuotes, notificationLog, AutomationScope, QuoteSource, AutomationRequest, AutomationToken (+2 more)

### Community 22 - "Database layer"
Cohesion: 0.23
Nodes (26): dynamic, POST(), dynamic, GET(), dynamic, GET(), dynamic, GET() (+18 more)

### Community 23 - "App routes"
Cohesion: 0.14
Nodes (25): metadata, ProgressPage(), HabitHeatmap(), LEVEL_CLASS, WEEKDAY_INITIAL, Delta(), ProgressData, ProgressView() (+17 more)

### Community 24 - "App routes"
Cohesion: 0.10
Nodes (3): ThemeToggle(), Button(), disabledPalette

### Community 25 - "App routes"
Cohesion: 0.15
Nodes (24): metadata, CalendarData, CalendarView(), FocusDay, HabitDay, habitOutcomeDisplay, Layer, TaskCalendar() (+16 more)

### Community 26 - "Domain logic"
Cohesion: 0.08
Nodes (18): acquireDeliveryAttempt(), activeSubscriptionWhere(), boundedErrorCode(), boundedStatus(), countActiveSubscriptions(), DeliveryAttemptClaim, listActiveSubscriptions(), markDeliveryAccepted() (+10 more)

### Community 27 - "Database layer"
Cohesion: 0.07
Nodes (9): createDb(), Database, db, getDb(), TaskInput, dailyPriorities, TaskStatus, DailyPriority (+1 more)

### Community 28 - "UI components"
Cohesion: 0.11
Nodes (23): FormProps, HabitFormModal(), HabitGoalOption, HabitLifeAreaOption, NumericControl(), dayCellConfig, DayCellState, HABIT_DESCRIPTION_MAX (+15 more)

### Community 29 - "App routes"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 30 - "Domain logic"
Cohesion: 0.13
Nodes (22): GoalDetailPage(), calculateGoalProgress(), clampPercent(), EMPTY_TASK_COUNTS, GoalProgressResult, GoalProgressSource, GoalTaskCounts, ancestorPath() (+14 more)

### Community 31 - "Domain logic"
Cohesion: 0.11
Nodes (24): ActionResult, AutomationOverview, createAutomationTokenAction(), deleteAutomationTokenAction(), idSchema, listAutomationAction(), qrSvgFor(), RequestSummary (+16 more)

### Community 32 - "Tsconfig.Json: Tsconfig.Json"
Cohesion: 0.11
Nodes (25): addDaysIso(), Allocation, ALLOCATION_MIN_MINUTES, ALLOCATION_STEP_MINUTES, AREA_MATCH_BONUS, CapacityStatus, capacitySummary(), CategoryActual (+17 more)

### Community 33 - "App routes"
Cohesion: 0.09
Nodes (25): browserFrom(), currentDeviceLabel(), deriveDeviceLabel(), DeviceLabelHints, NavigatorWithUaData, osFrom(), UNNAMED_DEVICE_LABEL, authSchema (+17 more)

### Community 34 - "UI components"
Cohesion: 0.13
Nodes (24): dynamic, GET(), BUCKET_CAP, buildGraveyardPayload(), countRepeats(), daysBetween(), extractTaskIds(), GraveyardBucket (+16 more)

### Community 35 - "Domain logic"
Cohesion: 0.12
Nodes (26): ActionResult, CreateEdgeInput, createEdgeSchema, CreateNodeInput, createNodeSchema, edgeIdSchema, edgeLabelSchema, finiteNumber (+18 more)

### Community 36 - "App routes"
Cohesion: 0.08
Nodes (12): addAllocation(), AllocationInput, FocusActual, getOrCreatePlan(), getPlan(), getPlanContents(), PlanWithContents, syncAllocations() (+4 more)

### Community 37 - "UI components"
Cohesion: 0.08
Nodes (11): getHabitSchedule(), HabitInput, HabitScheduleInput, listHabits(), listHabitsWithSchedule(), upsertHabitSchedule(), habitEntries, habitSchedules (+3 more)

### Community 38 - "Database layer"
Cohesion: 0.11
Nodes (20): DateBucket, toZonedDate(), deriveReviewStats(), ReviewWeek, ACTIVE_STATUSES, isInBucket(), TaskDateFields, taskEffectiveDate() (+12 more)

### Community 39 - "Domain logic"
Cohesion: 0.17
Nodes (18): dynamic, GET(), metadata, ReviewPage(), exportMyDataAction(), DataCard(), DateField(), DateFieldProps (+10 more)

### Community 40 - "Domain logic"
Cohesion: 0.12
Nodes (20): GoalsPage(), metadata, ActionResult, prose, reopenWeeklyReviewAction(), ReviewInput, reviewSchema, saveWeeklyReviewAction() (+12 more)

### Community 41 - "Domain logic"
Cohesion: 0.17
Nodes (19): clearHabitEntryAction(), logHabitEntryAction(), HabitLogControl(), LogHabit, LogInput, EntryAction, HabitsView(), HabitsWeekGrid() (+11 more)

### Community 42 - "Domain logic"
Cohesion: 0.14
Nodes (21): ActionResult, DEFAULT_TIMEZONE, isValidTimeZone(), TIMEZONE_OPTIONS, TimezoneOption, AutomationPrefsInput, automationPrefsSchema, deadlineLeadSchema (+13 more)

### Community 43 - "UI components"
Cohesion: 0.08
Nodes (18): PushDevice, PushOverview, enable, getStagedState, OVERVIEW, refresh, replace, signOut (+10 more)

### Community 44 - "Domain logic"
Cohesion: 0.08
Nodes (21): getOwnerId(), isOwner(), appSettingsRepo, automationRepo, brainDumpRepo, dailyPrioritiesRepo, goalsRepo, habitsRepo (+13 more)

### Community 45 - "Database layer"
Cohesion: 0.10
Nodes (22): BriefGoal, BriefHabit, BriefTask, MorningBriefPayload, OPEN, toBriefTask(), toMorningPayload(), EveningHabit (+14 more)

### Community 46 - "Domain logic"
Cohesion: 0.15
Nodes (22): draw(), hashSeed(), parseClock(), selectAnchorTask(), SMART_REMINDER_COOLDOWN_KINDS, SMART_REMINDER_COOLDOWN_MINUTES, SMART_REMINDER_SLOTS, SMART_REMINDER_STAGES (+14 more)

### Community 47 - "Package.Json: Package.Json"
Cohesion: 0.12
Nodes (22): createEmailEventSender(), defaultEmailEventDependencies(), EMAIL_EVENT_SECRET_HEADER, EMAIL_EVENT_TIMEOUT_MS, EmailEvent, EmailEventConfig, EmailEventConfigurationError, EmailEventDependencies (+14 more)

### Community 48 - "Design references"
Cohesion: 0.08
Nodes (25): scripts, build, check:consistency, db:backup, db:check, db:diagnose, db:generate, db:merge-accounts (+17 more)

### Community 49 - "Domain logic"
Cohesion: 0.16
Nodes (18): json(), POST(), stageSchema, PUSH_PAIRING_COOKIE, pushPairingCookieOptions(), createPairingSecret(), hashPairingSecret(), isPairingUsableForUser() (+10 more)

### Community 50 - "Domain logic"
Cohesion: 0.14
Nodes (21): AppLayout(), ActionResult, baseUrl(), createInviteAction(), createSchema, deleteInviteAction(), idSchema, InviteSummary (+13 more)

### Community 51 - "App routes"
Cohesion: 0.15
Nodes (17): ActionResult, archiveLifeAreaAction(), createLifeAreaAction(), restoreLifeAreaAction(), updateLifeAreaAction(), LifeAreasPage(), metadata, LifeAreaCard() (+9 more)

### Community 52 - "Database layer"
Cohesion: 0.13
Nodes (22): ActionResult, ALLOCATION_MAX_MINUTES, AcceptItemInput, acceptItemSchema, allocationInputSchema, AllocationInputValues, allocationMinutes, categoryLabel (+14 more)

### Community 53 - "Database layer"
Cohesion: 0.14
Nodes (18): AutomationJob, claimDueJobs(), completeJob(), failJob(), failUndeliveredJob(), leasedJob(), leasedJobBeforeDelivery(), markDeliveryStarted() (+10 more)

### Community 54 - "Documentation"
Cohesion: 0.11
Nodes (24): Settings & Preferences Screen (GoHa Design Mockup), Persistent Left Sidebar Navigation, Appearance Card (Light/Dark theme previews, Match System Settings), Avatar with Change Photo Action, GoHa Brand Lockup (Life Operating System), Calm Neutral Card Visual Language (off-white canvas, white rounded cards, sage/amber accents), Default Focus Timers (Focus Session 25 min, Short Break 5 min), Display Name Field (+16 more)

### Community 55 - "Domain logic"
Cohesion: 0.11
Nodes (19): dynamic, KIND_LABEL, BRAIN_DUMP_MAX, brainDumpCaptureSchema, ClaimLogInput, claimLogSchema, CreateTokenInput, DEDUPE_KEY_MAX (+11 more)

### Community 56 - "Domain logic"
Cohesion: 0.20
Nodes (18): RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS, RateDecision, rateLimitDecision(), windowStart(), AuthedAutomation, AutomationFailure, UNAUTHORIZED (+10 more)

### Community 57 - "Domain logic"
Cohesion: 0.14
Nodes (17): ActionResult, addDailyPriorityAction(), idSchema, planMyDayAction(), removeDailyPriorityAction(), BrainCard(), STATE_STYLE, EmptyDay() (+9 more)

### Community 58 - "Documentation"
Cohesion: 0.11
Nodes (14): countNodesInMap(), deleteTaskMapEdge(), deleteTaskMapNode(), getTaskMap(), getTaskMapGraph(), inLiveMap(), TaskMapNodeInput, updateNodePositions() (+6 more)

### Community 59 - "Test suite"
Cohesion: 0.10
Nodes (23): Fixed-Fluid Hybrid Grid on an 8px Unit, Intentional Calm Philosophy, Manrope Type Scale (display 300 to label 600), Serene Lifecycle Design System, Tonal Layering with Ambient Shadows (paper stack), Phase 0: Discovery and Design Audit, Nightshift Motion (springSnappy, springSmooth, easeOutExpo), Nightshift Design System (retired) (+15 more)

### Community 60 - "Domain logic"
Cohesion: 0.15
Nodes (18): createPinnedPushAgent(), endpointValidationFailureIsTransient(), FORBIDDEN_HOST_SUFFIXES, hasPrefix(), hostnameIsForbidden(), isPublicIpAddress(), isPublicIpv4(), isPublicIpv6() (+10 more)

### Community 61 - "App routes"
Cohesion: 0.18
Nodes (17): CommandTarget, loadCommandIndexAction(), AddMenu(), AddMenuFab(), ICON, Command, CommandPalette(), fuzzyScore() (+9 more)

### Community 62 - "Design references"
Cohesion: 0.12
Nodes (12): ActionButton(), TaskCard(), TaskLifeAreaRef, TaskChecklistItem(), Checkbox(), DetailPanel(), DetailRow(), formatClockLabel() (+4 more)

### Community 63 - "App routes"
Cohesion: 0.11
Nodes (18): Dropdown(), DropdownItem, isSelectable(), clamp(), Progress(), ProgressRing(), Tone, toneBar (+10 more)

### Community 64 - "App routes"
Cohesion: 0.16
Nodes (17): buildDuePayload(), deadlineKey(), DueItem, DuePayload, FOCUS_OVERRUN_GRACE_SECONDS, FocusOverrunItem, focusOverrunKey(), OPEN (+9 more)

### Community 65 - "UI components"
Cohesion: 0.12
Nodes (21): Next.js Agent Rules (breaking-change warning), Architecture Rules (Server Components, Server Actions), UUID Identifiers and Drizzle Kit Migration Rules, Repository Layer Seam under db/, Session-Derived Identity and User Scoping, GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth), Asia/Manila Timezone Rules, db:diagnose Read-Only Health Check (+13 more)

### Community 66 - "Database layer"
Cohesion: 0.12
Nodes (10): CategoryCard(), categoryColor(), CategoryEditorBody(), DaySummary(), DraftAllocation, FocusActual, GoalRef, PlannerView() (+2 more)

### Community 67 - "Design references"
Cohesion: 0.14
Nodes (21): To-Do Lists Screen (Stitch Design), Task as Hub: Entry Points into Goals, Life Areas, Task Map, and Focus, Date Derived Time Buckets Instead of Static Bucket Fields, Density Progression: Focused Cards Now, Compact Rows Later, Global Navigation Sidebar (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings), Linked Goal Chip (Launch SaaS MVP, Investor Relations), Inline Add Task to Today Affordance, This Month / This Week Rail Labels Wrapping and Overflowing the Rail (+13 more)

### Community 68 - "Design references"
Cohesion: 0.18
Nodes (16): endFocusSessionAction(), startFocusSessionAction(), FocusPage(), metadata, FocusView(), focusRepo, ABANDON_MAX_SECONDS, aggregateFocus() (+8 more)

### Community 69 - "Tooling scripts"
Cohesion: 0.13
Nodes (10): geistMono, inter, metadata, viewport, manifest(), MotionProvider(), ServiceWorkerRegistrar(), ThemeProvider() (+2 more)

### Community 70 - "Tooling scripts"
Cohesion: 0.18
Nodes (15): DurationPicker(), ExtendControl(), SegmentedControl(), SegmentedOption, ABANDON_AFTER_SECONDS, FOCUS_EXTEND_MAX_MINUTES, FOCUS_EXTEND_MIN_MINUTES, FOCUS_EXTEND_PRESETS_MINUTES (+7 more)

### Community 71 - "Domain logic"
Cohesion: 0.20
Nodes (13): lifeAreaIconMap, ColorPicker(), IconPicker(), COLOR_PRESETS, COMMON_ICON_KEYS, hexLuminance(), ICON_GROUPS, LifeAreaIconKey (+5 more)

### Community 72 - "Components.Json: Components.Json"
Cohesion: 0.11
Nodes (7): collectAncestorIds(), getGoal(), GoalInput, GoalUpdate, NOTE: an earlier version used correlated subqueries, Goal, GoalProgressUpdate

### Community 73 - "Tooling scripts"
Cohesion: 0.19
Nodes (19): Today Dashboard Screen (Stitch design), GoHa Brand Lockup and Life Operating System Tagline, Full Day Arc: morning greeting through evening reflection on one surface, Evening Reflection Entry Point, Time of Day Greeting and Date Header, Habits Checklist Widget, Life Score Ring Widget (82%), Navigation Module Set (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings) (+11 more)

### Community 74 - "Design references"
Cohesion: 0.14
Nodes (19): Weekly Review & Reflection Screen (Stitch Design), GoHa App Shell (Sidebar + Top Bar Layout), Complete Review Submit Action, Visual Language: warm cream canvas, white rounded cards, sage green accent, semantic icon colours (amber sun, red warning), Reflection Prompt: Focus for next week? (top 3 core intentions), Habit Consistency Metric (85% with progress bar), Life Score Trend Bar Chart (5 weekly bars, current 9.2 highlighted), Review Step: Plan Next Week (time-block major priorities) (+11 more)

### Community 75 - "App routes"
Cohesion: 0.19
Nodes (13): globalSetup(), PORT, { url: testDatabaseUrl }, QaMigrationTarget, resolveQaMigrationTarget(), DestructiveUrlSource, loadEnvFile(), requireTestDatabase() (+5 more)

### Community 76 - "App routes"
Cohesion: 0.21
Nodes (16): activeSettingsForKind(), CompleteWorkerInput, CompletionResult, fallback(), PreparedWorkerJob, prepareEvening(), prepareGraveyard(), prepareMorning() (+8 more)

### Community 77 - "Domain logic"
Cohesion: 0.14
Nodes (12): forceJson, outDir, url, BACKUP_FORMAT, BACKUP_TABLES, path, problems, warnings (+4 more)

### Community 78 - "UI components"
Cohesion: 0.14
Nodes (16): archiveTaskMapAction(), createTaskMapAction(), deleteTaskMapAction(), restoreTaskMapAction(), updateTaskMapAction(), TaskOption, ArchivedRow(), CreateMapModal() (+8 more)

### Community 79 - "Design references"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 80 - "Design references"
Cohesion: 0.16
Nodes (13): db, url, loadEnv(), loadEnvFile(), requireEnv(), db, parsed, target (+5 more)

### Community 81 - "Domain logic"
Cohesion: 0.18
Nodes (18): GoHa Brand Lockup: Life Operating System, Life Area Chip with Icon (Health & Fitness, Career, Finance, Learning), Module Navigation Set (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings), Habits & Routines Screen (Stitch design), Action List Card (checkable habits tagged by life area), Two-Column Card Grid on Off-White Canvas, Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence), Habit-to-Goal Linkage (Goal: Launch MVP) (+10 more)

### Community 82 - "Domain logic"
Cohesion: 0.20
Nodes (14): completeWorkerJob(), failWorkerJob(), AUTOMATION_JOB_LEASE_MS, AUTOMATION_JOB_MAX_ATTEMPTS, dueDailySchedule(), dueWeeklySchedule(), isPushJobKind(), isSameJobLocalDate() (+6 more)

### Community 83 - "Database layer"
Cohesion: 0.22
Nodes (15): DEFAULT_COLOR_KEY, DEFAULT_ICON_KEY, hashToIndex(), isHexColor(), LIFE_AREA_COLOR_KEYS, LIFE_AREA_DESCRIPTION_MAX, LIFE_AREA_ICON_KEYS, LIFE_AREA_NAME_MAX (+7 more)

### Community 84 - "Design references"
Cohesion: 0.16
Nodes (17): Goals Management Screen (Stitch Design), Add Goal Primary Action, Card Footer Metrics Row (task ratio, subgoal count, notes, due date), Per-Card Overflow Menu (kebab), Create New Goal Dashed Placeholder Card, Goal Breakdown Design Intent, Goal Card Component, Responsive Three-Column Goal Card Grid (+9 more)

### Community 85 - "Design references"
Cohesion: 0.19
Nodes (17): Life Areas Dashboard Screen (Stitch design), Per-Area Colour Coding (green Career/Growth, tan Health/Family, lavender Finance/Projects/Life Admin), Area Progress Bar (labelled track with trailing percentage), Compact Life Area Card variant (icon, name, big Life Score %, Goals and Tasks count pills), Expanded Life Area Card variant (Career: progress bar plus Active Goals / Pending Tasks / Completion stats), Goals / Tasks Count Pill (flag and check icons with numeric roll-up), Life Area Card Grid (mixed-width masonry-style layout), Life Area Taxonomy (Career, Health, Finance, Growth, Family, Projects, Life Admin) (+9 more)

### Community 86 - "Domain logic"
Cohesion: 0.20
Nodes (12): assignLayers(), Bounds, findFreeSpot(), LAYOUT_COLUMN_GAP, LAYOUT_ROW_GAP, LayoutEdge, layoutMap(), LayoutNode (+4 more)

### Community 87 - "Test suite"
Cohesion: 0.16
Nodes (10): getForDate(), insertIfAbsent(), InspirationWithTakeaway, listWithTakeawaysInRange(), Row, store, toRecord(), dailyInspirations (+2 more)

### Community 88 - "Domain logic"
Cohesion: 0.17
Nodes (16): Life Score / Progress Analytics Screen (Stitch design), Rounded Card Grid Layout Pattern, Focus Sessions Stat Tile (12 completed), Goals Advanced Stat Tile (3 moved forward), Life Area Colour and Icon Coding, Life Score Radial Gauge (78, 'Strong', +4 from last month), Life Score Composite Metric, Life Score Trend Area/Line Chart (Weeks 1-4, 50-100 axis) (+8 more)

### Community 89 - "Domain logic"
Cohesion: 0.18
Nodes (16): Task Map Explorer Screen (Stitch design), Active Nav Item Treatment (Task Map selected), Active Node State with Inline Progress, Labelled Yes / No Branch Edges, Floating Canvas Toolbar, Dashboard Redesign (example task map), Decision Node (hexagon), Focus Mode Entry Point from Task Map (+8 more)

### Community 90 - "Database layer"
Cohesion: 0.39
Nodes (12): guardSignUp(), metadata, RegisterPage(), createInviteCode(), formatInviteCode(), hashInviteCode(), INVITE_PREFIX_LENGTH, inviteCodePrefix() (+4 more)

### Community 91 - "App routes"
Cohesion: 0.22
Nodes (14): ActionResult, archiveHabitAction(), createHabitAction(), habitColumns(), revalidateHabitSurfaces(), scheduleColumns(), updateHabitAction(), validateReferences() (+6 more)

### Community 92 - "Design references"
Cohesion: 0.16
Nodes (9): ActionResult, completeOnboardingAction(), HierarchyDiagram(), HierarchyRow, Step, WelcomeOnboarding(), completeOnboardingAction, push (+1 more)

### Community 93 - "Documentation"
Cohesion: 0.26
Nodes (15): addEdgeAction(), addNodeAction(), assertMapEditable(), deleteEdgeAction(), deleteNodeAction(), fail(), importTasksAction(), layoutMapAction() (+7 more)

### Community 95 - "Design references"
Cohesion: 0.28
Nodes (9): hashDate(), pickDailyQuote(), pickRestDayQuote(), QuoteLike, sourcesFor(), resolveRestDayQuote(), POOL, quote() (+1 more)

### Community 96 - "Design references"
Cohesion: 0.26
Nodes (13): discardFocusSessionAction(), extendFocusSessionAction(), pauseFocusSessionAction(), resumeFocusSessionAction(), saveFocusNoteAction(), ActiveTimer(), FocusSetup(), NoteStatus (+5 more)

### Community 97 - "Domain logic"
Cohesion: 0.18
Nodes (14): App Shell: persistent sidebar + top bar layout, Primary Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings), Time Block Item (Deep Work Block, 9:00 AM - 12:00 PM, left accent bar), Top Bar Actions (Focus Mode, Add Task, notifications, theme toggle, avatar), Two-pane calendar layout: wide month overview plus narrow always-visible agenda rail, Quick Action Primary Button, Active Navigation State (Life Areas pill highlighted sage), Add Task Global Action (top bar, filled accent button) (+6 more)

### Community 98 - "Database layer"
Cohesion: 0.22
Nodes (14): Atomic Writable-CTE Brain Dump Conversion, Date-Derived Task Views (no stored bucket), listGoalsWithTaskCounts Correlated-Subquery Bug, Phase 10: Brain Dump, Phase 5: Goals with Hierarchy and Progress, Phase 6: Tasks / To-dos, Phase 7: Today Dashboard, brain_dump_items table (polymorphic conversion) (+6 more)

### Community 99 - "Database layer"
Cohesion: 0.20
Nodes (8): materializeAndClaimJobs(), isSabbathDate(), SABBATH_MESSAGE, SabbathContext, WEEK, at(), mocks, task()

### Community 100 - "Database layer"
Cohesion: 0.21
Nodes (8): handlers, json(), pendingClaims, POST(), sendWelcomeEmail(), settleClaim(), mocks, USER

### Community 101 - "Test suite"
Cohesion: 0.19
Nodes (13): acceptSuggestionAction(), addFreeformItemAction(), addPlanToTodayAction(), logActualMinutesAction(), moveItemAction(), removePlanItemAction(), renameFreeformItemAction(), revalidatePlannerSurfaces() (+5 more)

### Community 102 - "Design references"
Cohesion: 0.19
Nodes (9): schema, auth, DEPLOYMENT_URL, PASSWORD_RESET_TTL_SECONDS, PRODUCTION_URL, emailEventSender(), getCurrentUser(), getSession (+1 more)

### Community 103 - "Documentation"
Cohesion: 0.19
Nodes (13): Brain Dump Quick Capture Screen (design mockup), Image and Voice Attachment Affordances, Brain Dump Module, Capture Composer Textarea, Dump It Submit Action, Frictionless Capture Principle, Global Top Bar (search, Focus Mode, Add Task, theme, avatar), GoHa Navigation Map (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings) (+5 more)

### Community 104 - "UI components"
Cohesion: 0.26
Nodes (13): Focus Session Screen (Stitch design), Active Task: Finalize Q4 Presentation, Complete Task Action (checkmark), Circular Countdown Timer with Progress Ring (24:15), Distraction Dump Card, Distraction-Free Single-Purpose Layout, Duration Preset Pills (15/25/45/60 min plus custom), Feedback Notes Card (+5 more)

### Community 105 - "Documentation"
Cohesion: 0.18
Nodes (7): getOrCreateUserSettings(), getUserSettings(), UserSettingsInput, QuoteSourcePref, ThemePreference, userSettings, UserSettings

### Community 106 - "UI components"
Cohesion: 0.17
Nodes (8): FocusSession, FocusTimerState, useFocusTimer, discardAction, endAction, saveNoteAction, startAction, stats

### Community 107 - "UI components"
Cohesion: 0.24
Nodes (12): Calendar Schedule Screen (GoHa design mockup), Calendar Header: month title, prev/Today/next stepper, Month|Week|Day segmented control, Daily Focus Card with narrative summary and progress bar, Day-cell Event Chips (colour-coded by item type; strikethrough = completed), Event Agenda Item with nested prep-task checklist (Job Interview - Acme Corp, 10:00 AM, Video Call), Habit Agenda Item (Read 20 pages, 'Habit - Anytime', repeat icon), Month Grid (Sun-Sat, 6 rows, leading/trailing days muted), Task Agenda Items with checkbox and overdue emphasis (Submit Expense Report, Due 5:00 PM; Draft Proposal) (+4 more)

### Community 108 - "Test suite"
Cohesion: 0.20
Nodes (12): e2e/audit.spec.ts Browser-Driven Route Audit, Focus Duration Derived from Timestamps, Focus startSchema optional-vs-nullish Bug, Schedule-Aware Habit Streak Engine, ThemeToggle Hydration Mismatch (perceived lag), Phase 8: Habits, Phase 9: Focus Mode, focus_sessions table (+4 more)

### Community 109 - "Documentation"
Cohesion: 0.36
Nodes (9): asPgError(), CHECK_VIOLATION, CONSTRAINTS, isCheckViolation(), isUniqueViolation(), PgErrorShape, sqlState(), UNIQUE_VIOLATION (+1 more)

### Community 110 - "Database layer"
Cohesion: 0.27
Nodes (8): disconnectPushDeviceAction(), listPushDevicesAction(), BENEFITS, deviceCountLabel(), NotificationDevicesCard(), Pairing, shortDate(), displayDeviceLabel()

### Community 111 - "End-to-end tests"
Cohesion: 0.24
Nodes (11): Expansion (V1b) Scope, MVP (V1a) Scope, Out of Scope for GoHa (no AI, automations, billing), Working Style and Quality Gates, Two-Stage Delivery on One Complete Schema, Phase 12: Calendar, Review, Progress (not started), Phase 13: Settings and Polish Pass, Phase 1: Scaffold and App Shell (+3 more)

### Community 112 - "Tooling scripts"
Cohesion: 0.20
Nodes (5): FocusStats(), FocusStatsData, FocusBreakdown, ROOT, stats

### Community 113 - "Tooling scripts"
Cohesion: 0.24
Nodes (4): Meridiem, parse(), serialize(), TimeField()

### Community 116 - "Database layer"
Cohesion: 0.20
Nodes (10): UI States and Design Fidelity Rules, Reserved Electric Cyan Accent (light equals meaning), Today as the Reference Screen, Violet Secondary for Progress and Data, 44x44 Minimum Tap Target, Glass on Chrome Only, Never on Rows, Liquid Glass Material Tiers (blur plus saturate 180%), Mandatory Reduced-Transparency and @supports Fallbacks (+2 more)

### Community 117 - "Database layer"
Cohesion: 0.22
Nodes (6): fillEmptyReviewDraft(), getWeeklyReview(), ReviewDraftFields, WeeklyReviewInput, weeklyReviews, WeeklyReview

### Community 118 - "End-to-end tests"
Cohesion: 0.20
Nodes (4): consoleProblems, Finding, findings, IGNORED

### Community 119 - "Package.Json: Package.Json"
Cohesion: 0.29
Nodes (6): CONFIRM_KEY, endpointId(), ProductionMigrationTarget, resolveProductionMigrationTarget(), db, target

### Community 120 - "UI components"
Cohesion: 0.22
Nodes (7): args, commit, findAccount(), fromEmail, OWNED_TABLES, sql, toEmail

### Community 121 - "Documentation"
Cohesion: 0.39
Nodes (6): LoginPage(), metadata, AuthForm(), DEFAULT_REDIRECT, hasUnsafeCharacters(), safeRedirectPath()

### Community 122 - "Domain logic"
Cohesion: 0.25
Nodes (7): "automation_jobs", "push_deliveries", "public"."user", "public"."notification_log", "public"."push_subscriptions", "push_pairing_sessions", "push_subscriptions"

### Community 123 - "Tooling scripts"
Cohesion: 0.32
Nodes (7): "automation_requests", "automation_tokens", "daily_quotes", "notification_log", "public"."user", "public"."user", "public"."automation_tokens"

### Community 124 - "Tooling scripts"
Cohesion: 0.29
Nodes (7): IGNORED, Problem, problems, ROUTES, timings, visit(), watch()

### Community 125 - "Tooling scripts"
Cohesion: 0.25
Nodes (7): engines, node, pnpm, name, packageManager, private, version

### Community 126 - "Test suite"
Cohesion: 0.29
Nodes (6): ActionResult, extendMinutesSchema, idSchema, noteSchema, startSchema, FOCUS_EXTEND_SECONDS

### Community 127 - "Test suite"
Cohesion: 0.38
Nodes (7): HabitFormFields(), scheduleTypeOf(), LifeAreaFormFields(), nextUnusedColorKey(), toColorKey(), toIconKey(), toHabitFieldErrors()

### Community 128 - "Claude.Md: Claude.Md"
Cohesion: 0.33
Nodes (7): Sage Blue-Green Accent with Earth-Tone Categories, life_areas table, user table (Better Auth account record), user_settings table, Circular Checkbox Filled with the Life Area Color, Label Opacity System (rgba labels, not hex grays), Apple System Colors (separate light and dark values)

### Community 129 - "Vercel.Json: Vercel.Json"
Cohesion: 0.33
Nodes (6): EXTS, files, ROOT, RULES, SEARCH_DIRS, walk()

### Community 130 - "UI components"
Cohesion: 0.29
Nodes (3): parsed, sql, url

### Community 131 - "End-to-end tests"
Cohesion: 0.29
Nodes (5): DOMAIN_TABLES, sql, TEST_EMAIL, TEST_PASSWORD, { url: testDbUrl, source }

### Community 132 - "Proxy.Ts: Proxy.Ts"
Cohesion: 0.38
Nodes (6): codeLines(), EXTS, FILES, findAll(), ROOT, walk()

### Community 133 - "Test suite"
Cohesion: 0.33
Nodes (6): GoHa Conceptual Chain (Life Area to Reflect), One Connected System (no duplicate dashboard data), GoHa (Goals, Habits, and ACTION), The Connected Chain (user to task maps), Database Constraints as the Second Integrity Layer, Deletion Behavior (cascade, set null, archive)

### Community 134 - "Test suite"
Cohesion: 0.40
Nodes (3): TaskDetailPanel(), makeTask(), setup()

### Community 135 - "Test suite"
Cohesion: 0.33
Nodes (5): sin1, crons, framework, regions, $schema

### Community 138 - "Database layer"
Cohesion: 0.40
Nodes (3): AUTH_PATHS, config, EXACT_PUBLIC_PATHS

### Community 140 - "Next.Config.Ts: Next.Config.Ts"
Cohesion: 0.40
Nodes (3): AUTH, mocks, P256DH

### Community 141 - "Static assets"
Cohesion: 0.40
Nodes (4): automationOverview, people, pushOverview, settings

### Community 143 - "Test suite"
Cohesion: 0.67
Nodes (3): dynamic, GET(), withTimeout()

### Community 144 - "Database layer"
Cohesion: 0.50
Nodes (3): "inspiration_takeaways", "public"."user", "public"."daily_inspirations"

### Community 145 - "Database layer"
Cohesion: 0.67
Nodes (4): Phase 11: Task Maps (React Flow), task_map_edges table, task_map_nodes table, task_maps table (React Flow canvases)

### Community 147 - "Static assets"
Cohesion: 0.50
Nodes (3): CSP, nextConfig, SECURITY_HEADERS

### Community 153 - "App routes"
Cohesion: 1.00
Nodes (3): File/Document Icon (Next.js scaffold asset), Globe/World Icon (Next.js scaffold asset), Browser Window Icon (Next.js scaffold asset)

## Ambiguous Edges - Review These
- `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)` → `create-next-app Bootstrap README`  [AMBIGUOUS]
  README.md · relation: references
- `Event Prep Subtasks` → `Task Card`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/calendar_schedule/code.html · relation: conceptually_related_to
- `Thought Card with Relative Timestamp` → `Section Item Count Indicator`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/brain_dump_quick_capture/screen.png · relation: shares_data_with
- `Primary Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` → `Focus Mode Entry Point (top bar)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/life_areas_dashboard/screen.png · relation: conceptually_related_to
- `Parent Goal Breadcrumb: Launch SaaS MVP` → `Distraction-Free Single-Purpose Layout`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/focus_session/screen.png · relation: conceptually_related_to
- `Goal Status Badge (In Progress, On Track, At Risk, Not Started)` → `Overdue Due Date Emphasis (red Oct 15)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/goals_management/screen.png · relation: conceptually_related_to
- `Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence)` → `Weekly Flow Grid (habits x weekdays, Done/Partial/Missed)`  [AMBIGUOUS]
  design/stitch_goha_productivity_system_dashboard/habit_tracker/screen.png · relation: shares_data_with
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
- **754 isolated node(s):** `ActionResult`, `CapacityStatus`, `PlanEntry`, `PlannerCategoryKind`, `SuggestionReason` (+749 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GoHa Tech Stack (Next.js 16, Drizzle, Neon, Better Auth)` and `create-next-app Bootstrap README`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Event Prep Subtasks` and `Task Card`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Thought Card with Relative Timestamp` and `Section Item Count Indicator`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Primary Sidebar Navigation (Today, Goals, To-dos, Task Map, Focus, Habits, Calendar, Brain Dump, Life Areas, Review, Progress, Settings)` and `Focus Mode Entry Point (top bar)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Parent Goal Breadcrumb: Launch SaaS MVP` and `Distraction-Free Single-Purpose Layout`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Goal Status Badge (In Progress, On Track, At Risk, Not Started)` and `Overdue Due Date Emphasis (red Oct 15)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Habit Detail Card (Code practice, Minimum vs Ideal, routine + cadence)` and `Weekly Flow Grid (habits x weekdays, Done/Partial/Missed)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._