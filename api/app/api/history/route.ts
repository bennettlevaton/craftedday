import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // TODO: auth check via Clerk
  // TODO: fetch meditations for user from DB
  // TODO: return list
  return NextResponse.json({ message: "not implemented" }, { status: 501 });
}
