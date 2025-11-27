const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const sessionOptions = {
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'klassencoach',
  password: process.env.DB_PASSWORD || 'klassencoachpass',
  database: process.env.DB_NAME || 'klassencoach'
};

const pool = mysql.createPool({
  ...sessionOptions,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function runInitScript() {
  const sqlPath = path.join(__dirname, '..', 'db', 'init.sql');
  const contents = fs.readFileSync(sqlPath, 'utf8');
  const statements = contents
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);

  // Use a bootstrap connection without database on failures
  const baseConfig = { ...sessionOptions };
  delete baseConfig.database;

  const connection = await mysql.createConnection({ ...baseConfig, multipleStatements: true });
  try {
    for (const stmt of statements) {
      await connection.query(stmt);
    }
  } finally {
    await connection.end();
  }
}

async function ensureSchema() {
  try {
    await runInitScript();
    await query('SELECT 1 FROM classes LIMIT 1');
  } catch (err) {
    if (
      err.code === 'ER_NO_SUCH_TABLE' ||
      err.code === 'ER_BAD_DB_ERROR' ||
      err.code === 'ER_NO_DB_ERROR' ||
      err.code === 'ER_BAD_FIELD_ERROR'
    ) {
      await runInitScript();
      await query('SELECT 1 FROM classes LIMIT 1');
    } else {
      throw err;
    }
  }
}

module.exports = { pool, query, sessionOptions, ensureSchema };
