/**
 * Repository barrel. The app imports these namespaces (e.g.
 * `import { tasksRepo } from "@/db"`) and never touches Drizzle directly
 * (CLAUDE.md section 4). Each namespace is user-scoped by convention: the first
 * argument is always the session user id.
 */
export * as usersRepo from "./users";
export * as lifeAreasRepo from "./life-areas";
export * as goalsRepo from "./goals";
export * as tasksRepo from "./tasks";
export * as habitsRepo from "./habits";
export * as focusRepo from "./focus";
export * as brainDumpRepo from "./brain-dump";
export * as dailyPrioritiesRepo from "./daily-priorities";
export * as taskMapsRepo from "./task-maps";
export * as reviewsRepo from "./reviews";
export * as settingsRepo from "./settings";
