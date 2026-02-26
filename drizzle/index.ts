import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const connectionString = process.env.TURSO_DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL must be defined");
}

const client = createClient({
    url: connectionString,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const db = drizzle(client);
