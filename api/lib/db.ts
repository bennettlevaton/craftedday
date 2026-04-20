import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const rawUrl = new URL(process.env.PLANETSCALE_DATABASE_URL!);
rawUrl.searchParams.delete("sslrootcert");

const client = postgres(rawUrl.toString(), {
  ssl: { rejectUnauthorized: true },
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(client, { schema });
