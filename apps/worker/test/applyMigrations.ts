// Runs before each test file: create the D1 tables from migrations/ in the local test DB.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
