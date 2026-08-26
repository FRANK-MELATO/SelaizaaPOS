require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  console.log('Starting database migrations...');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'atchaar_pos',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get list of SQL migration files sorted alphabetically
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    // Get already executed migrations
    const executedResult = await client.query('SELECT filename FROM migrations');
    const executed = new Set(executedResult.rows.map(r => r.filename));

    let migrationsRun = 0;

    for (const file of files) {
      if (executed.has(file)) {
        console.log(`[SKIP] ${file} (already executed)`);
        continue;
      }

      console.log(`[RUN]  ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[OK]   ${file}`);
        migrationsRun++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[FAIL] ${file}:`, err.message);
        throw err;
      }
    }

    if (migrationsRun === 0) {
      console.log('All migrations are up to date.');
    } else {
      console.log(`\nCompleted: ${migrationsRun} migration(s) executed successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
