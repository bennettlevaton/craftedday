import { randomUUID } from "crypto";
import { db } from "./db";
import { meditationJobs } from "@/db/schema";
import type { VoiceGender } from "./elevenlabs";

type ProfileSnapshot = {
  name: string | null;
  experienceLevel: string | null;
  primaryGoals: string[];
  primaryGoalCustom: string | null;
  preferenceSummary: string | null;
};

type EnqueueParams = {
  userId: string;
  prompt: string;
  durationSeconds: number;
  voiceGender: VoiceGender;
  profile: ProfileSnapshot;
  source?: "user" | "cron";
};

export async function enqueueJob(params: EnqueueParams): Promise<string> {
  const id = randomUUID();
  await db.insert(meditationJobs).values({
    id,
    userId: params.userId,
    prompt: params.prompt,
    durationSeconds: params.durationSeconds,
    voiceGender: params.voiceGender,
    profileSnapshot: JSON.stringify(params.profile),
    source: params.source ?? "user",
  });
  return id;
}

function getWorkerUrl(): string {
  if (process.env.WORKER_URL) return process.env.WORKER_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/meditation/worker`;
  return "http://localhost:3000/api/meditation/worker";
}

export function triggerWorker(): void {
  const url = getWorkerUrl();
  fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});
}
