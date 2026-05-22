import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Connection pool. 10 is sane for v1; bump if we see contention on drop nights.
const pool = postgres(connectionString, { max: 10 });

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
