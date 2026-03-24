import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const watchlists = pgTable("watchlists", {
  id:        serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type:      text("type").notNull(),
  value:     text("value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniq: unique("watchlists_dedup").on(table.sessionId, table.type, table.value),
}));
