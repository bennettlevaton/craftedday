import { eq } from "drizzle-orm";
import { db } from "./db";
import { userProfiles } from "@/db/schema";

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
