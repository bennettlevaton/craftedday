import { pgTable, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

// No users table — Clerk provides the user ID directly on every request.
// user_profiles.user_id and meditations.user_id are Clerk user IDs.

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

export const dailySessions = pgTable("daily_sessions", {
  userId: varchar("user_id", { length: 128 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),      // YYYY-MM-DD UTC
  meditationId: varchar("meditation_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meditations = pgTable("meditations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  prompt: text("prompt").notNull(),
  script: text("script").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }).notNull(),
  duration: integer("duration"),
  title: varchar("title", { length: 128 }),
  feeling: varchar("feeling", { length: 10 }),      // calmer | same | tense
  whatHelped: varchar("what_helped", { length: 32 }), // breath | body | silence | visualization
  feedback: text("feedback"),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
