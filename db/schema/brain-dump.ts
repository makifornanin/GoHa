import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";
import { brainDumpConvertedType, brainDumpStatus } from "./enums";

/**
 * Brain Dump: fast capture inbox. An item can be converted into a Task, Goal, or
 * Habit. `convertedType` + `convertedEntityId` record what it became (polymorphic,
 * so `convertedEntityId` is not a foreign key). The conversion is a single atomic
 * statement (see db/repositories/brain-dump.ts) so an item and its target entity
 * can never fall out of sync.
 */
export const brainDumpItems = pgTable(
  "brain_dump_items",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text().notNull(),
    status: brainDumpStatus().notNull().default("inbox"),
    /**
     * Sticky-note colour key (see lib/brain-dump NOTE_COLOR_KEYS). Stored as a
     * key, never a hex value, so the palette stays a presentation concern
     * (CLAUDE.md section 9). Null means the default note colour.
     */
    color: text(),
    /** What the item became: 'task' | 'goal' | 'habit'. */
    convertedType: brainDumpConvertedType(),
    /** The created entity's id (polymorphic across tables, so not a FK). */
    convertedEntityId: uuid(),
    sortOrder: integer().notNull().default(0),
    ...auditTimestamps,
  },
  (t) => [
    index("brain_dump_items_user_status_idx").on(t.userId, t.status),
    check(
      "brain_dump_items_converted_consistent",
      sql`(${t.convertedType} is null and ${t.convertedEntityId} is null) or (${t.convertedType} is not null and ${t.convertedEntityId} is not null)`,
    ),
  ],
);
