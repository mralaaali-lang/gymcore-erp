const { Pool } = require('pg');

// Try different common PostgreSQL ports
const ports = [5432, 5433, 5434, 5435, 5436, 5437, 5438, 5439, 5440];

async function test() {
  for (const port of ports) {
    try {
      const pool = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${port}/gimawi_saas` });
      const r = await pool.query('SELECT 1');
      console.log('Connected on port', port);
      return;
    } catch (e) {
      // continue
    }
  }
  console.log('No PostgreSQL found on common ports');
}

test();