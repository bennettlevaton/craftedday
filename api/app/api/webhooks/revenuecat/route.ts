import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions } from "@/db/schema";
import { openNewPeriod, closeCurrentPeriod, upsertSubscription } from "@/lib/subscription";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";

type RCEvent = {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id: string;
  period_type: string; // TRIAL | NORMAL | INTRO
  purchased_at_ms: number;
  expiration_at_ms: number | null;
};

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== process.env.REVENUECAT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: RCEvent;
  try {
    const body = await req.json();
    event = body.event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // app_user_id is the current ID (Clerk ID after login).
  // original_app_user_id is the first ID ever assigned (anonymous before login).
  const clerkId = event.app_user_id;
  const periodStart = new Date(event.purchased_at_ms);
  const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  const periodType = event.period_type ?? "NORMAL";

  log("webhook:rc", event.type, { clerkId, productId: event.product_id });

  try {
    switch (event.type) {
      case "INITIAL_PURCHASE":
        await upsertSubscription({
          clerkId,
          rcCustomerId: event.app_user_id,
          status: "active",
          periodType,
          productId: event.product_id,
          periodStart,
          periodEnd: periodEnd!,
        });
        await openNewPeriod(clerkId, periodStart);
        break;

      case "RENEWAL":
        // Close trial/old period, open fresh paid period.
        await closeCurrentPeriod(clerkId, periodStart);
        await upsertSubscription({
          clerkId,
          rcCustomerId: event.app_user_id,
          status: "active",
          periodType,
          productId: event.product_id,
          periodStart,
          periodEnd: periodEnd!,
        });
        await openNewPeriod(clerkId, periodStart);
        break;

      case "CANCELLATION":
        // Still active until period_end — keep access, just won't renew.
        await db
          .update(subscriptions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(subscriptions.clerkId, clerkId));
        break;

      case "EXPIRATION":
        await db
          .update(subscriptions)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(subscriptions.clerkId, clerkId));
        if (periodEnd) await closeCurrentPeriod(clerkId, periodEnd);
        break;

      default:
        log("webhook:rc", "unhandled", { type: event.type });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("webhook:rc", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
