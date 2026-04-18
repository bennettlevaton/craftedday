import { pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id", { length: 128 }).primaryKey(),
  clerkId: varchar("clerk_id", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meditations = pgTable("meditations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  prompt: text("prompt").notNull(),
  script: text("script").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }).notNull(),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
