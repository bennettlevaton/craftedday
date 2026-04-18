import type { Config } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

const rawUrl = new URL(process.env.PLANETSCALE_DATABASE_URL!);
rawUrl.searchParams.delete("sslrootcert");

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: rawUrl.toString(),
    ssl: true,
  },
} satisfies Config;
