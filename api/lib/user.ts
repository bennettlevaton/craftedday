import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, userProfiles } from "@/db/schema";

export async function ensureUser(userId: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({
      id: userId,
      clerkId: userId,
      email: `${userId}@craftedday.local`,
    });
  }
}

export async function getOrCreateProfile(userId: string) {
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (existing.length > 0) return existing[0];

  await ensureUser(userId);
  await db.insert(userProfiles).values({ userId });

  const created = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return created[0];
}
