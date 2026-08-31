# TERMINOLOGY.md - the words GoHa uses

One name per concept, everywhere the user can read it: UI labels, buttons, empty
states, toasts, modal titles, notification copy, and onboarding. This file is
the tiebreaker. If a screen disagrees with it, the screen is wrong.

Written because the app had drifted: the sidebar said "To-dos", the form said
"New Task", the goal panel said "Linked tasks", and the detail panel called a
subtask a "step". Three words for two things is how a product stops explaining
itself.

---

## 1. The chain

```
Life Area
    |
    v
Goal
    |
    v
Subgoal
    |
    v
To-do
    |
    v
Subtask
```

| Term | Means | Never write |
| --- | --- | --- |
| **Life Area** | A standing part of the user's life: Career, Health, Faith. Does not complete. | Category, Domain, Bucket |
| **Goal** | An outcome worth working toward: "Find a new job". Completes. | Objective, Target, Ambition |
| **Subgoal** | A milestone the goal is made of: "Finish resume". Completes. | Sub-goal (hyphen), Milestone as a NOUN in labels, Child goal |
| **To-do** | A concrete action: "Rewrite experience section". Completes. | Task, Action item, Item |
| **Subtask** | A step inside one to-do: "Improve automation bullets". | Step, Checklist item, Sub-task |
| **Habit** | A repeated behaviour, logged per day. Does not complete. | Routine, Streak, Ritual |

Plurals: Life Areas, Goals, Subgoals, To-dos, Subtasks, Habits.

**"Milestone" is allowed only as EXPLANATION, never as the name.** The section
heading is "Subgoals"; its subtitle may read "The milestones this goal is made
of". This is deliberate: "milestone" is the clearer word for what a subgoal *is*
and the worse word for finding it again in a menu.

## 2. The screens

| Screen | Label | Route | Why the two differ |
| --- | --- | --- | --- |
| Today | Today | `/today` | |
| Day Planner | Day Planner | `/planner` | |
| Goals | Goals | `/goals` | Goal detail lives at `/goals/[goalId]` |
| To-dos | To-dos | `/tasks` | The table is `tasks` and the route predates the vocabulary. Renaming a live route would break saved links and every notification URL already delivered, for no reader benefit. |
| Calendar | Calendar | `/calendar` | |
| Life Areas | Life Areas | `/life-areas` | |
| Habits | Habits | `/habits` | |
| Focus | Focus | `/focus` | |
| Task Map | Task Map | `/task-maps` | See exceptions below |
| Brain Dump | Brain Dump | `/brain-dump` | |
| Progress | Progress | `/progress` | |
| Review | Review | `/review` | |
| Settings | Settings | `/settings` | |

## 3. Navigation groups

Named as verbs, because they describe what the user is doing, not what the
feature is.

- **Plan**: Today, Day Planner, Goals, To-dos, Calendar, Life Areas
- **Do**: Habits, Focus, Task Map
- **Capture**: Brain Dump
- **Review**: Progress, Review
- **Account**: Settings

## 4. Deliberate exceptions

Two places keep the word "task", and both are proper nouns rather than the
concept:

1. **Task Map** (`/task-maps`). The feature name, and it has been shipped,
   documented and linked under it. "To-do Map" describes it less well anyway:
   the canvas holds notes, decisions, blockers and phases, not only to-dos.
2. **Smart Task Reminders**. The notification feature's name, matching the
   `smart_task_reminder` value in the `notification_kind` enum, the automation
   guides, and the n8n workflows. Renaming the UI while the wire value stays
   would put two names on one thing across a boundary GoHa does not control.

Everything in code keeps its existing identifiers: the `tasks` table, `taskId`,
`TaskCard`, `/tasks`. This document governs what a PERSON reads, not what a
developer types. Renaming storage to match prose would be a large, risky,
zero-value migration.

## 5. Actions

| Do this | Not this |
| --- | --- |
| Add | New, Create (as a button in the shell) |
| Add to-do / Add subgoal / Add habit | New Task, Create Task |
| Archive | Delete (for Goals, Life Areas, Habits, Task Maps) |
| Complete / Reopen | Done / Undone, Finish / Unfinish |
| Save | Submit, Apply, Update |

The shell's create affordance is **"+ Add"**, and its menu names the thing:
Goal, Subgoal, To-do, Habit, Brain dump. A screen whose purpose is one kind of
record may use the direct form ("Add to-do" on the To-dos page), because a menu
of one is a wasted click.

## 6. Tone

For notifications and empty states: **strict on the work, playful in delivery,
encouraging toward the person.**

GoHa may state what it can prove from its own rows: what is on today, what is
finished, what is late. It may not assert what it cannot observe. Never write
"you failed", "you wasted your day", "you did nothing", or any claim that
someone has been idle: GoHa cannot see whether an afternoon was spent on a to-do
that was never ticked, and a notification that assumes the worst about a day it
could not observe is what gets notifications turned off.
