import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/log";
import { getOrCreateProfile } from "@/lib/user";

export const runtime = "nodejs";

type Body = {
  name?: string;
  experienceLevel?: "beginner" | "intermediate" | "experienced";
  primaryGoals?: string[];
  primaryGoalCustom?: string;
};

const VALID_LEVELS = new Set(["beginner", "intermediate", "experienced"]);
const VALID_GOALS = new Set([
  "stress",
  "sleep",
  "focus",
  "anxiety",
  "general",
  "other",
]);

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.TEST_USER_ID ?? "test-user-1";
    const body = (await req.json()) as Body;

    const name = body.name?.trim();
    const experienceLevel = body.experienceLevel;
    const goals = body.primaryGoals;
    const customRaw = body.primaryGoalCustom?.trim();

    if (!name || name.length < 1 || name.length > 128) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }
    if (!experienceLevel || !VALID_LEVELS.has(experienceLevel)) {
      return NextResponse.json(
        { error: "invalid experienceLevel" },
        { status: 400 },
      );
    }
    if (!Array.isArray(goals) || goals.length === 0 || goals.length > 6) {
      return NextResponse.json(
        { error: "pick at least one reason" },
        { status: 400 },
      );
    }
    for (const g of goals) {
      if (!VALID_GOALS.has(g)) {
        return NextResponse.json(
          { error: `invalid goal: ${g}` },
          { status: 400 },
        );
      }
    }

    let primaryGoalCustom: string | null = null;
    if (goals.includes("other")) {
      if (!customRaw || customRaw.length < 1 || customRaw.length > 256) {
        return NextResponse.json(
          { error: "tell us what brings you here" },
          { status: 400 },
        );
      }
      primaryGoalCustom = customRaw;
    }

    await getOrCreateProfile(userId);
    await db
      .update(userProfiles)
      .set({
        name,
        experienceLevel,
        primaryGoals: Array.from(new Set(goals)),
        primaryGoalCustom,
        onboardedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("user:onboarding", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
