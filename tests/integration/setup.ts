// Integration tests run against a separate database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_test";
