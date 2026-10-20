import { TEST_API_PORT, TEST_DATABASE_URL, TEST_SERVICE_KEY } from "../support/env";

// The app's data layer (src/db/api.ts) uses the local PostgREST that the global setup
// starts; test helpers that prepare data use the database directly (./direct-db.ts).
process.env.SUPABASE_REST_URL = `http://localhost:${TEST_API_PORT}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_KEY;
delete process.env.SUPABASE_SECRET_KEY;
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
export {};
