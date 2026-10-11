/**
 * Gimawi SaaS — Load/Stress Test
 *
 * Simulates 1,000 concurrent users hitting attendance endpoints.
 * Run: npx ts-node test/load/attendance.stress.ts
 *
 * Requires a running Gimawi backend with seeded test data.
 * Set env: TEST_BASE_URL (default http://localhost:4000)
 *         TEST_TOKEN (valid JWT for a receptionist/manager)
 */

import http from 'http';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';
const TOKEN = process.env.TEST_TOKEN || '';
const CONCURRENT = 1000;
const DURATION_SEC = 30;

let completed = 0;
let errors = 0;
const latencies: number[] = [];

interface Stats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  completed: number;
  errors: number;
  duration: number;
  rps: number;
}

function request(path: string, method: string, body?: string): Promise<number> {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(path, BASE_URL);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - start;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          latencies.push(latency);
        } else {
          errors++;
        }
        resolve(latency);
      });
    });

    req.on('error', () => {
      errors++;
      resolve(Date.now() - start);
    });

    req.on('timeout', () => {
      errors++;
      req.destroy();
      resolve(Date.now() - start);
    });

    if (body) req.write(body);
    req.end();
  });
}

async function worker(id: number): Promise<void> {
  const endpoints = [
    { path: '/api/members', method: 'GET' },
    { path: '/api/membership-offers', method: 'GET' },
    { path: '/api/attendance/today', method: 'GET' },
    { path: '/health', method: 'GET' },
  ];

  const endTime = Date.now() + DURATION_SEC * 1000;
  while (Date.now() < endTime) {
    const ep = endpoints[id % endpoints.length];
    try {
      await request(ep.path, ep.method);
      completed++;
    } catch {
      errors++;
    }
    // Simulate think-time of ~50ms between requests per worker
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
  }
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('ERROR: Set TEST_TOKEN env var to a valid JWT.');
    process.exit(1);
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Gimawi SaaS — Load Test`);
  console.log(`  Target:     ${BASE_URL}`);
  console.log(`  Concurrent: ${CONCURRENT} workers`);
  console.log(`  Duration:   ${DURATION_SEC}s`);
  console.log(`  Start time: ${new Date().toISOString()}`);
  console.log(`═══════════════════════════════════════════════\n`);

  const startAll = Date.now();

  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENT; i++) {
    workers.push(worker(i));
  }
  await Promise.all(workers);

  const totalMs = Date.now() - startAll;
  const sorted = [...latencies].sort((a, b) => a - b);

  const stats: Stats = {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    completed,
    errors,
    duration: totalMs,
    rps: Math.round((completed / totalMs) * 1000),
  };

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`  Completed requests: ${stats.completed}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Duration:           ${stats.duration}ms`);
  console.log(`  Requests/sec:       ${stats.rps}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Latency (ms):`);
  console.log(`    Min:    ${stats.min}`);
  console.log(`    Avg:    ${stats.avg}`);
  console.log(`    Max:    ${stats.max}`);
  console.log(`    P50:    ${stats.p50}`);
  console.log(`    P95:    ${stats.p95}`);
  console.log(`    P99:    ${stats.p99}`);
  console.log(`═══════════════════════════════════════════════\n`);

  if (stats.errors > stats.completed * 0.1) {
    console.warn(`⚠ WARNING: Error rate exceeds 10%. Check server capacity.`);
  }
  if (stats.p95 > 2000) {
    console.warn(`⚠ WARNING: P95 latency over 2s. Bottleneck detected.`);
  }
}

main().catch(console.error);
