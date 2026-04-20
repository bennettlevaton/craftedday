import { eq } from "drizzle-orm";
import { db } from "./db";
import { userProfiles } from "@/db/schema";

// Creates a user_profiles row lazily on first access.
// No separate users table — Clerk user ID is the anchor.
export async function getOrCreateProfile(userId: string) {
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  await db.insert(userProfiles).values({ userId });

  const created = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return created[0];
}
