import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const rawUrl = new URL(process.env.PLANETSCALE_DATABASE_URL!);
rawUrl.searchParams.delete("sslrootcert");

// Serverless tuning. Vercel spins up many short-lived function instances; each
// one having a pool of 10 idle connections (postgres.js default) blows past
// PlanetScale's primary connection cap under any real concurrency.
//   - max: 1            → one connection per function instance
//   - idle_timeout: 10  → release fast when invocation ends
//   - prepare: false    → required for PgBouncer transaction-pooling mode,
//                         which is what PlanetScale's pooled URL uses
const client = postgres(rawUrl.toString(), {
  ssl: { rejectUnauthorized: true },
  max: 1,
  idle_timeout: 10,
  connect_timeout: 30,
  prepare: false,
});

export const db = drizzle(client, { schema });
