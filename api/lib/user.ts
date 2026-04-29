import { eq } from "drizzle-orm";
import { db } from "./db";
import { userProfiles } from "@/db/schema";

export type MePayload = {
  needsOnboarding: boolean;
  name: string | null;
  experienceLevel: string | null;
  primaryGoals: string[];
  primaryGoalCustom: string | null;
  voiceGender: string | null;
  notificationHour: number;
};

// Single source of truth for the /me JSON shape. Both /api/user/me and the
// combined /api/home endpoint read from this so changes propagate to both.
export async function getMePayload(userId: string): Promise<MePayload> {
  const profile = await getOrCreateProfile(userId);
  return {
    needsOnboarding: profile.onboardedAt === null,
    name: profile.name,
    experienceLevel: profile.experienceLevel,
    primaryGoals: profile.primaryGoals ?? [],
    primaryGoalCustom: profile.primaryGoalCustom,
    voiceGender: profile.voiceGender,
    notificationHour: profile.notificationHour ?? 8,
  };
}

// Creates a user_profiles row lazily on first access.
// No separate users table — Clerk user ID is the anchor.
//
// Atomic: INSERT ... ON CONFLICT DO NOTHING handles concurrent first-access
// races (two requests for a brand-new user firing in parallel) without
// creating duplicates or throwing on the second insert.
export async function getOrCreateProfile(userId: string) {
  await db
    .insert(userProfiles)
    .values({ userId })
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return rows[0];
}
