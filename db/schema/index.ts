/**
 * Schema barrel. Drizzle Kit reads this file (see drizzle.config.ts) and the
 * Drizzle client passes `{ schema }` from here, so every table and enum MUST be
 * re-exported below to be included in migrations and the typed query API.
 */
export * from "./enums";
export * from "./auth";
export * from "./life-areas";
export * from "./goals";
export * from "./tasks";
export * from "./habits";
export * from "./focus";
export * from "./brain-dump";
export * from "./daily-priorities";
export * from "./task-maps";
export * from "./reviews";
export * from "./settings";
export * from "./automation";
