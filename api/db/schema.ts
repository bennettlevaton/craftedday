import { pgTable, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id", { length: 128 }).primaryKey(),
  clerkId: varchar("clerk_id", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }),
  experienceLevel: varchar("experience_level", { length: 32 }),
  primaryGoals: varchar("primary_goals", { length: 32 }).array(),
  primaryGoalCustom: varchar("primary_goal_custom", { length: 256 }),
  voiceGender: varchar("voice_gender", { length: 16 }).default("female").notNull(),
  preferenceSummary: text("preference_summary"),
  preferenceSummaryUpdatedAt: timestamp("preference_summary_updated_at"),
  onboardedAt: timestamp("onboarded_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const meditations = pgTable("meditations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  prompt: text("prompt").notNull(),
  script: text("script").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }).notNull(),
  duration: integer("duration"),
  rating: integer("rating"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
