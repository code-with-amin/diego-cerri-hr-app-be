import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

export const s3 = new S3Client({
  region: env.AWS_REGION,
  // Supabase Storage (and other S3-compatible services) require a custom
  // endpoint plus path-style addressing; AWS S3 works with both unset.
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface UploadParams {
  key: string;
  body: Buffer;
  contentType: string;
}

/** Upload a private object to the resumes bucket. */
export async function uploadObject({ key, body, contentType }: UploadParams): Promise<void> {
  if (env.S3_SKIP) {
    console.warn(`[S3_SKIP] Skipping upload: ${key} (${contentType}, ${body.length} bytes)`);
    return;
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export type ResumeDisposition = 'inline' | 'attachment';

/**
 * Generate a short-lived presigned GET URL for a stored resume.
 * `disposition=inline` opens in browser; `attachment` forces download.
 */
// Stable public sample PDF served by W3C — used only when S3_SKIP=true.
const SAMPLE_PDF_URL = 'https://pdfobject.com/pdf/sample.pdf';

export async function getResumeUrl(
  key: string,
  filename: string,
  disposition: ResumeDisposition = 'inline',
  expiresInSeconds = 300,
): Promise<string> {
  if (env.S3_SKIP) {
    console.warn(`[S3_SKIP] Returning sample PDF instead of S3 object: ${key}`);
    return SAMPLE_PDF_URL;
  }
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `${disposition}; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/** Delete an object (used when rolling back a failed candidate insert). */
export async function deleteObject(key: string): Promise<void> {
  if (env.S3_SKIP) {
    console.warn(`[S3_SKIP] Skipping delete: ${key}`);
    return;
  }
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
