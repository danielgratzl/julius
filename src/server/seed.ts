// Loads the example household. Usage: npm run seed [-- --force]
import { localToday } from "../shared/dates";
import { initDatabase, sqlite } from "./db";
import { demoData } from "./demo";
import { replaceAll } from "./repo";

initDatabase();
const { n } = sqlite.prepare("SELECT count(*) AS n FROM accounts").get() as { n: number };
if (n > 0 && !process.argv.includes("--force")) {
  console.error(`Database already has ${n} accounts. Run with --force to replace everything with demo data.`);
  process.exit(1);
}
replaceAll(demoData(localToday()));
console.log("Demo data loaded.");
