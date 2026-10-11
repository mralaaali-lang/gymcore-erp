import http from 'http';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:4000';

function req(method: string, path: string, token?: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const u = new URL(path, BASE);
    const opts: http.RequestOptions = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json' } as any,
    };
    if (data) (opts.headers as any)['Content-Length'] = Buffer.byteLength(data);
    if (token) (opts.headers as any)['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const login = await req('POST', '/auth/login', undefined, { email: 'a@a.com', password: '12345678' });
  const token = login.data.access_token;
  if (!token) { console.log('Login failed:', login.status); return; }
  console.log('Login OK');

  const c = await req('POST', '/api/members', token, {
    full_name: 'TestEncrypt ' + Date.now(),
    phone_number: '+966500099988',
  });
  console.log('Create:', c.status, JSON.stringify(c.data));
  if (c.status === 500) { console.log('Full response:', JSON.stringify(c.data)); return; }

  // Direct DB check
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`SELECT set_config('app.encryption_key', $1, false)`, [process.env.ENCRYPTION_KEY]);
  const r = await pool.query(`
    SELECT phone_number, decrypt_sensitive(phone_encrypted) as decrypted
    FROM members WHERE full_name = $1
  `, [c.data?.data?.full_name]);
  console.log('DB phone_number (should be NULL):', r.rows[0]?.phone_number);
  console.log('DB decrypted:', r.rows[0]?.decrypted);
  await pool.end();
}

main().catch(console.error);
