import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://gymcore:gymcore_secret@localhost:5433/gymcore_test';

describe('Platform auth integration', () => {
  it('rejects login with missing fields', async () => {
    const res = await request(app).post('/platform/auth/login').send({});
    expect(res.status).toBe(400);
  });
});
