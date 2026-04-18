import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

type Body = {
  voiceGender?: "female" | "male";
};

export async function GET() {
  try {
    const userId = process.env.TEST_USER_ID ?? "test-user-1";
    const rows = await db
      .select({ voiceGender: users.voiceGender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return NextResponse.json({
      voiceGender: rows[0]?.voiceGender ?? "female",
    });
  } catch (err) {
    logError("preferences:get", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = process.env.TEST_USER_ID ?? "test-user-1";
    const body = (await req.json()) as Body;

    if (body.voiceGender !== "female" && body.voiceGender !== "male") {
      return NextResponse.json(
        { error: "voiceGender must be 'female' or 'male'" },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({ voiceGender: body.voiceGender })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("preferences:patch", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
