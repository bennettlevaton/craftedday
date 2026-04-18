import { mysqlTable, varchar, text, int, timestamp } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 128 }).primaryKey(),
  clerkId: varchar("clerk_id", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meditations = mysqlTable("meditations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  prompt: text("prompt").notNull(),
  script: text("script").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }).notNull(),
  duration: int("duration"), // seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
