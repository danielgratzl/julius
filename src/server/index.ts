import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { localToday } from "../shared/dates";
import { initDatabase, sqlite } from "./db";
import { demoData } from "./demo";
import { replaceAll } from "./repo";
import api from "./routes/api";

const app = new Hono();

app.use("/api/*", logger());
app.route("/api", api);
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }));
  // SPA fallback for client-side routes
  app.get("*", serveStatic({ root: "./dist/client", path: "index.html" }));
}

initDatabase();
// SEED_DEMO=true fills an empty database with the example household (handy for a first look)
if (process.env.SEED_DEMO === "true") {
  const { n } = sqlite.prepare("SELECT count(*) AS n FROM accounts").get() as { n: number };
  if (n === 0) {
    replaceAll(demoData(localToday()));
    console.log("Loaded demo data");
  }
}
const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`Julius running on http://localhost:${port}`);
