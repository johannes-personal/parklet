// Direct database access for preparing and inspecting test data. The app itself never
// connects to the database directly; see src/db/api.ts.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { TEST_DATABASE_URL } from "../support/env";

const client = postgres(TEST_DATABASE_URL, { max: 3, onnotice: () => {} });
export const db = drizzle(client, { schema });
export const closeDb = () => client.end();
