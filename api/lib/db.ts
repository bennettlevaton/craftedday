import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const client = postgres(process.env.PLANETSCALE_DATABASE_URL!, {
  ssl: "verify-full",
});

export const db = drizzle(client, { schema });
