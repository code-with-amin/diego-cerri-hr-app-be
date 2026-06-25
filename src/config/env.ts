import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Custom S3 endpoint (e.g. Supabase Storage's S3-compatible API).
  // Leave unset to target real AWS S3.
  S3_ENDPOINT: z.string().url().optional(),

  CORS_ORIGIN: z.string().default('*'),

  MAX_UPLOAD_MB: z.coerce.number().default(10),

  // Set to true in development to skip real S3 uploads.
  S3_SKIP: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins =
  env.CORS_ORIGIN === '*'
    ? '*'
    : env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean);

export const maxUploadBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
