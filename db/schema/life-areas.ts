import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { auditTimestamps, primaryId } from "./_shared";
import { user } from "./auth";

/**
 * Life Areas: the top of the GoHa chain (Life Area -> Goal -> ... ). Valuable
 * entities are archived, never hard-deleted (CLAUDE.md section 7).
 */
export const lifeAreas = pgTable(
  "life_areas",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    /** Design token key or hex resolved to a token (e.g. "primary", "#4f7cff"). */
    color: text(),
    /** lucide-react icon name. */
    icon: text(),
    /** Relative weight used by the Life Score / balance calculation. */
    weight: integer().notNull().default(1),
    sortOrder: integer().notNull().default(0),
    isArchived: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    ...auditTimestamps,
  },
  (t) => [
    index("life_areas_user_id_idx").on(t.userId),
    index("life_areas_user_active_idx").on(t.userId, t.isArchived),
    check("life_areas_weight_positive", sql`${t.weight} > 0`),
  ],
);
