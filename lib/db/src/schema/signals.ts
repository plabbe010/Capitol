import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const signals = pgTable("signals", {
  id:          serial("id").primaryKey(),
  ticker:      text("ticker").notNull().unique(),
  signal:      text("signal").notNull(),
  confidence:  integer("confidence").notNull(),
  summary:     text("summary").notNull(),
  flagNote:    text("flag_note").notNull().default(""),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});
