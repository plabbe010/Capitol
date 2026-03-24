import { pgTable, serial, text, integer, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

export const trades = pgTable("trades", {
  id:             serial("id").primaryKey(),
  representative: text("representative").notNull(),
  ticker:         text("ticker").notNull(),
  date:           text("date").notNull(),
  type:           text("type").notNull(),
  asset:          text("asset"),
  party:          text("party"),
  state:          text("state"),
  chamber:        text("chamber"),
  amount:         text("amount"),
  filed:          text("filed"),
  committees:     jsonb("committees").$type<string[]>().default([]),
  signalScore:    integer("signal_score").notNull().default(0),
  tier:           text("tier").notNull().default("low"),
  signals:        jsonb("signals").$type<{ label: string; pts: number }[]>().default([]),
  noise:          jsonb("noise").$type<{ label: string; pts: number }[]>().default([]),
  firstSeenAt:    timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt:     timestamp("last_seen_at").notNull().defaultNow(),
}, (table) => ({
  uniq: unique("trades_dedup").on(table.representative, table.ticker, table.date, table.type),
}));
