import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes without a real .env.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/hr_app';
  process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';
  process.env.ADMIN_EMAIL ??= 'admin@kpi.com';
  process.env.ADMIN_PASSWORD ??= 'test-password';
  process.env.AWS_REGION ??= 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID ??= 'test';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
  process.env.S3_BUCKET ??= 'test-bucket';
});

describe('app smoke tests', () => {
  it('GET /api/health returns ok', async () => {
    const { createApp } = await import('../src/app');
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects unauthenticated access to the candidate list', async () => {
    const { createApp } = await import('../src/app');
    const res = await request(createApp()).get('/api/candidates');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown routes', async () => {
    const { createApp } = await import('../src/app');
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
