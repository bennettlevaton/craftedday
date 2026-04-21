import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "./db";
import { subscriptions, usagePeriods } from "@/db/schema";

export const CUSTOM_MINUTES_LIMIT = 500;

type QuotaOk    = { ok: true;  minutesUsed: number; periodEnd: Date | null };
type QuotaBlock = { ok: false; reason: "not_subscribed" | "quota_exceeded"; minutesUsed: number; periodEnd: Date | null };

export async function checkSubscriptionAndQuota(
  clerkId: string,
  requestedMinutes: number,
): Promise<QuotaOk | QuotaBlock> {
  if (process.env.SKIP_SUBSCRIPTION_CHECK === "true") {
    return { ok: true, minutesUsed: 0, periodEnd: null };
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, clerkId))
    .limit(1);

  const now = new Date();
  const isActive =
    sub &&
    (sub.status === "active" || sub.status === "cancelled") &&
    (!sub.periodEnd || sub.periodEnd > now);

  if (!isActive) {
    return { ok: false, reason: "not_subscribed", minutesUsed: 0, periodEnd: sub?.periodEnd ?? null };
  }

  const [period] = await db
    .select({ customMinutesUsed: usagePeriods.customMinutesUsed })
    .from(usagePeriods)
    .where(and(eq(usagePeriods.clerkId, clerkId), isNull(usagePeriods.periodEnd)))
    .limit(1);

  const minutesUsed = period?.customMinutesUsed ?? 0;

  if (minutesUsed + requestedMinutes > CUSTOM_MINUTES_LIMIT) {
    return { ok: false, reason: "quota_exceeded", minutesUsed, periodEnd: sub.periodEnd };
  }

  return { ok: true, minutesUsed, periodEnd: sub.periodEnd };
}

// Called only after successful R2 upload + DB save.
export async function deductCustomMinutes(clerkId: string, minutes: number) {
  if (process.env.SKIP_SUBSCRIPTION_CHECK === "true") return;
  await db
    .update(usagePeriods)
    .set({ customMinutesUsed: sql`${usagePeriods.customMinutesUsed} + ${minutes}` })
    .where(and(eq(usagePeriods.clerkId, clerkId), isNull(usagePeriods.periodEnd)));
}

export async function openNewPeriod(clerkId: string, periodStart: Date) {
  await db.insert(usagePeriods).values({
    id: randomUUID(),
    clerkId,
    periodStart,
  });
}

export async function closeCurrentPeriod(clerkId: string, periodEnd: Date) {
  await db
    .update(usagePeriods)
    .set({ periodEnd })
    .where(and(eq(usagePeriods.clerkId, clerkId), isNull(usagePeriods.periodEnd)));
}

export async function upsertSubscription(data: {
  clerkId: string;
  rcCustomerId: string;
  status: string;
  productId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const [existing] = await db
    .select({ clerkId: subscriptions.clerkId })
    .from(subscriptions)
    .where(eq(subscriptions.clerkId, data.clerkId))
    .limit(1);

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        status: data.status,
        productId: data.productId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.clerkId, data.clerkId));
  } else {
    await db.insert(subscriptions).values({
      clerkId: data.clerkId,
      rcCustomerId: data.rcCustomerId,
      status: data.status,
      productId: data.productId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
  }
}
