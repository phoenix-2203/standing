import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// Any Postgres driver Drizzle supports (node-postgres in the app, PGlite in tests).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
  }
  return db;
}
