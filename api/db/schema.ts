import { pgTable, varchar, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";

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

// One row per user. Updated by RevenueCat webhooks.
export const subscriptions = pgTable("subscriptions", {
  clerkId:     varchar("clerk_id", { length: 128 }).primaryKey(),
  rcCustomerId: varchar("rc_customer_id", { length: 128 }),
  status:      varchar("status", { length: 32 }).notNull().default("inactive"), // active | cancelled | expired | inactive
  periodType:  varchar("period_type", { length: 16 }).notNull().default("NORMAL"), // TRIAL | NORMAL
  productId:   varchar("product_id", { length: 128 }),
  periodStart: timestamp("period_start"),
  periodEnd:   timestamp("period_end"),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// Append-only usage history. One row per billing period per user.
// period_end IS NULL = current open period. Closed on RENEWAL/EXPIRATION.
export const usagePeriods = pgTable("usage_periods", {
  id:                 varchar("id", { length: 128 }).primaryKey(),
  clerkId:            varchar("clerk_id", { length: 128 }).notNull(),
  periodStart:        timestamp("period_start").notNull(),
  periodEnd:          timestamp("period_end"),
  customMinutesUsed:  integer("custom_minutes_used").default(0).notNull(),
  dailyCount:         integer("daily_count").default(0).notNull(),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("usage_periods_clerk_id_idx").on(t.clerkId)]);

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
