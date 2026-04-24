import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { log, logError } from "@/lib/log";
import { getOrCreateProfile } from "@/lib/user";
import { getUserId, isAuthError } from "@/lib/auth";
import { grantWelcomeSession } from "@/lib/daily";

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
    const userId = await getUserId(req);
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

    const profile = await getOrCreateProfile(userId);
    const isFirstOnboarding = profile.onboardedAt === null;

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

    // Give brand-new users an instant-playable first session so they don't
    // land on home to an empty daily card. Only runs when onboardedAt was
    // null before this call — an existing user re-submitting onboarding
    // (shouldn't happen via the app, but protect anyway) won't get another
    // welcome. Failure is non-fatal — onboarding still succeeds.
    if (isFirstOnboarding) {
      try {
        const result = await grantWelcomeSession(userId);
        log("onboarding", "welcome grant", { userId, result });
      } catch (err) {
        logError("onboarding:welcome", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("user:onboarding", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
