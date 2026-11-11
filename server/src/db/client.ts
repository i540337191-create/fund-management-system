import {databaseUrlFromEnv} from "../config.ts";
import { Client } from "pg";

export function createDbClient(databaseUrl = databaseUrlFromEnv()) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return new Client({ connectionString: databaseUrl,connectionTimeoutMillis:4000 });
}

export async function withDbClient<T>(callback: (client: Client) => Promise<T>, databaseUrl = databaseUrlFromEnv()) {
  const client = createDbClient(databaseUrl);
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
