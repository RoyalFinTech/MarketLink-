require('dotenv').config();
const fs = require('fs'), path = require('path');
const { Pool } = require('pg');
const DIR = path.join(__dirname, 'migrations');
async function run() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied = new Set((await pool.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename));
  const pending = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort().filter(f => !applied.has(f));
  if (!pending.length) { console.log('No pending migrations.'); await pool.end(); return; }
  for (const file of pending) {
    console.log(`Applying ${file}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ok ${file}`);
    } catch (err) { await client.query('ROLLBACK'); console.error(`  FAILED: ${err.message}`); throw err; }
    finally { client.release(); }
  }
  console.log(`Done. Applied ${pending.length} migration(s).`);
  await pool.end();
}
run().catch(err => { console.error(err); process.exit(1); });
