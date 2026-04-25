import { randomUUID } from "crypto";
import { send } from "@vercel/queue";
import { db } from "./db";
import { meditationJobs } from "@/db/schema";
import type { VoiceGender } from "./elevenlabs";

export const QUEUE_TOPIC = "meditation-generate";

type ProfileSnapshot = {
  name: string | null;
  experienceLevel: string | null;
  primaryGoals: string[];
  primaryGoalCustom: string | null;
  preferenceSummary: string | null;
  timeOfDay?: string | null;
  archetype?: string;
};

type EnqueueParams = {
  userId: string;
  prompt: string;
  durationSeconds: number;
  voiceGender: VoiceGender;
  profile: ProfileSnapshot;
  source?: "user" | "cron";
};

export type QueueJobMessage = { jobId: string };

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
  await send<QueueJobMessage>(QUEUE_TOPIC, { jobId: id });
  return id;
}
