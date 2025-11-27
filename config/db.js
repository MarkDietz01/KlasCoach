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

module.exports = { pool, query, sessionOptions };
