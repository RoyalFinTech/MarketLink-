require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => logger.error('PG pool error', { error: err.message }));
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const dur = Date.now() - start;
  if (dur > 200) logger.warn('Slow query', { text: text.slice(0,80), dur });
  return result;
}
async function getClient() { return pool.connect(); }
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
module.exports = { pool, query, getClient, withTransaction };
