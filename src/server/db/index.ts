import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });

export const sqlite = new Database(join(dataDir, "julius.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function initDatabase() {
  migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
  const { n } = sqlite.prepare("SELECT count(*) AS n FROM persons").get() as { n: number };
  if (n === 0) {
    db.insert(schema.persons)
      .values([
        { id: crypto.randomUUID(), name: "Me", color: "#3b7dd8", sortOrder: 0 },
        { id: crypto.randomUUID(), name: "Partner", color: "#d9822b", sortOrder: 1 },
      ])
      .run();
  }
}
