import { localServiceKey } from "../../scripts/postgrest.mjs";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_test";
export const TEST_API_PORT = Number(process.env.TEST_API_PORT ?? 3310);
export const TEST_SERVICE_KEY: string = localServiceKey();
