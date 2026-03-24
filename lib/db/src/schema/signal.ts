import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const signals = pgTable("signals", {
  id:         serial("id").primaryKey(),

  // One signal per ticker — shared across all users
  ticker:     text("ticker").notNull().unique(),

  // Signal result fields
  signal:     text("signal").notNull(),       // "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"
  confidence: integer("confidence").notNull(),
  summary:    text("summary").notNull(),
  flagNote:   text("flag_note").notNull().default(""),

  // Cache control — regenerate if stale (older than 24h)
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});