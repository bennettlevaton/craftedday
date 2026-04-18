import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // TODO: auth check via Clerk
  // TODO: parse prompt from body
  // TODO: generate script via Claude
  // TODO: convert to audio via ElevenLabs
  // TODO: upload audio to R2
  // TODO: save meditation record to DB
  // TODO: return audio URL
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
