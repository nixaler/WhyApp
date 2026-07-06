import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl:
    process.env["NODE_ENV"] === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected DB error", err);
});

export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;
