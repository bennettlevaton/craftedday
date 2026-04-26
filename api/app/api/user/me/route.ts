import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/log";
import { getOrCreateProfile } from "@/lib/user";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_LEVELS = new Set(["beginner", "intermediate", "experienced"]);
const VALID_GOALS = new Set([
  "stress",
  "sleep",
  "focus",
  "anxiety",
  "general",
  "other",
]);
const VALID_VOICES = new Set(["female", "male"]);

type PatchBody = {
  name?: string;
  experienceLevel?: string;
  primaryGoals?: string[];
  primaryGoalCustom?: string | null;
  voiceGender?: string;
  notificationHour?: number;
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const profile = await getOrCreateProfile(userId);

    return NextResponse.json({
      needsOnboarding: profile.onboardedAt === null,
      name: profile.name,
      experienceLevel: profile.experienceLevel,
      primaryGoals: profile.primaryGoals ?? [],
      primaryGoalCustom: profile.primaryGoalCustom,
      voiceGender: profile.voiceGender,
      notificationHour: profile.notificationHour ?? 8,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("user:me:get", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as PatchBody;

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 1 || name.length > 128) {
        return NextResponse.json({ error: "invalid name" }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.experienceLevel !== undefined) {
      if (!VALID_LEVELS.has(body.experienceLevel)) {
        return NextResponse.json(
          { error: "invalid experienceLevel" },
          { status: 400 },
        );
      }
      updates.experienceLevel = body.experienceLevel;
    }

    if (body.primaryGoals !== undefined) {
      const goals = body.primaryGoals;
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

      updates.primaryGoals = Array.from(new Set(goals));

      if (goals.includes("other")) {
        const custom = body.primaryGoalCustom?.trim();
        if (!custom || custom.length < 1 || custom.length > 256) {
          return NextResponse.json(
            { error: "tell us what brings you here" },
            { status: 400 },
          );
        }
        updates.primaryGoalCustom = custom;
      } else {
        updates.primaryGoalCustom = null;
      }
    }

    if (body.voiceGender !== undefined) {
      if (!VALID_VOICES.has(body.voiceGender)) {
        return NextResponse.json(
          { error: "invalid voiceGender" },
          { status: 400 },
        );
      }
      updates.voiceGender = body.voiceGender;
    }

    if (body.notificationHour !== undefined) {
      const h = body.notificationHour;
      if (typeof h !== "number" || !Number.isInteger(h) || h < 0 || h > 23) {
        return NextResponse.json(
          { error: "invalid notificationHour" },
          { status: 400 },
        );
      }
      updates.notificationHour = h;
    }

    await getOrCreateProfile(userId);
    await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.userId, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("user:me:patch", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
