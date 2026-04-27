import { desc } from "drizzle-orm";
import { pgTable, varchar, text, integer, timestamp, boolean, index, primaryKey, serial } from "drizzle-orm/pg-core";

// No users table — Clerk provides the user ID directly on every request.
// user_profiles.user_id and meditations.user_id are Clerk user IDs.

export const userProfiles = pgTable("user_profiles", {
  userId: varchar("user_id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 128 }),
  experienceLevel: varchar("experience_level", { length: 32 }),
  primaryGoals: varchar("primary_goals", { length: 32 }).array(),
  primaryGoalCustom: varchar("primary_goal_custom", { length: 256 }),
  voiceGender: varchar("voice_gender", { length: 16 }).default("female").notNull(),
  notificationHour: integer("notification_hour").default(8).notNull(),
  preferenceSummary: text("preference_summary"),
  preferenceSummaryUpdatedAt: timestamp("preference_summary_updated_at"),
  onboardedAt: timestamp("onboarded_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dailySessions = pgTable("daily_sessions", {
  userId: varchar("user_id", { length: 128 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),      // YYYY-MM-DD ET
  meditationId: varchar("meditation_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);

// One row per user. Updated by RevenueCat webhooks.
export const subscriptions = pgTable("subscriptions", {
  clerkId:     varchar("clerk_id", { length: 128 }).primaryKey(),
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

export const meditationJobs = pgTable("meditation_jobs", {
  id:              varchar("id", { length: 128 }).primaryKey(),
  userId:          varchar("user_id", { length: 128 }).notNull(),
  prompt:          text("prompt").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  voiceGender:     varchar("voice_gender", { length: 16 }).notNull(),
  profileSnapshot: text("profile_snapshot").notNull(), // JSON blob
  status:          varchar("status", { length: 16 }).notNull().default("pending"), // pending | processing | done | failed
  audioUrl:        varchar("audio_url", { length: 512 }),
  title:           varchar("title", { length: 128 }),
  script:          text("script"),
  errorMessage:    text("error_message"),
  attempts:        integer("attempts").default(0).notNull(),
  source:          varchar("source", { length: 16 }).notNull().default("user"), // user | cron
  enqueuedAt:      timestamp("enqueued_at").defaultNow().notNull(),
  startedAt:       timestamp("started_at"),
  completedAt:     timestamp("completed_at"),
}, (t) => [
  index("meditation_jobs_user_id_idx").on(t.userId),
]);

// One row per actual listen. Re-listens create new rows.
// Streak / "did they meditate today" is derived from this table, not from
// the existence of a meditations row (which only proves they generated one).
export const meditationSessions = pgTable("meditation_sessions", {
  id:              varchar("id", { length: 128 }).primaryKey(),
  userId:          varchar("user_id", { length: 128 }).notNull(),
  meditationId:    varchar("meditation_id", { length: 128 }).notNull(),
  listenedSeconds: integer("listened_seconds").default(0).notNull(),
  completed:       boolean("completed").default(false).notNull(),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("meditation_sessions_user_id_idx").on(t.userId),
  index("meditation_sessions_user_created_idx").on(t.userId, t.createdAt),
]);

export const meditations = pgTable("meditations", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(),
  prompt: text("prompt").notNull(),
  script: text("script").notNull(),
  audioUrl: varchar("audio_url", { length: 512 }).notNull(),
  duration: integer("duration"),
  title: varchar("title", { length: 128 }),
  feeling: varchar("feeling", { length: 10 }),      // calmer | same | tense
  whatHelped: varchar("what_helped", { length: 32 }).array(), // multi-select: breath, body, belly_anchor, release, silence, visualization, voice, pacing
  feedback: text("feedback"),
  archetype: varchar("archetype", { length: 32 }),  // daily-session archetype id (null for custom)
  isFavorite: boolean("is_favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // /history, /stats, /favorites, archetype affinity, preference summary all
  // query (user_id) ordered by created_at desc. Without this the planner sorts
  // every user-row set on each call.
  index("meditations_user_created_idx").on(t.userId, desc(t.createdAt)),
]);

// Daily Instagram reel generator. One row per successfully posted reel.
// Used to feed past quotes/prompts back into the generator so it doesn't
// repeat itself. Multiple rows per date are allowed — we may post >1/day.
export const reelPosts = pgTable("reel_posts", {
  id:            serial("id").primaryKey(),
  date:          varchar("date", { length: 10 }).notNull(),  // YYYY-MM-DD pacific
  quote:         text("quote").notNull(),
  caption:       text("caption").notNull(),
  hashtags:      varchar("hashtags", { length: 64 }).array().notNull(),
  visualPrompt:  text("visual_prompt").notNull(),
  theme:         varchar("theme", { length: 64 }),
  videoUrl:      text("video_url"),
  bufferPostId:  varchar("buffer_post_id", { length: 128 }),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("reel_posts_created_at_idx").on(desc(t.createdAt)),
]);
