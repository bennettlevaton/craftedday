import { verifyToken } from "@clerk/backend";
import type { NextRequest } from "next/server";
import { logError } from "./log";

export async function getUserId(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header");
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties: [
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
      ],
    });
    return payload.sub;
  } catch (err) {
    logError("auth", err);
    throw new AuthError("Invalid token");
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
