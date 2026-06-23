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
export async function getResumeUrl(
  key: string,
  filename: string,
  disposition: ResumeDisposition = 'inline',
  expiresInSeconds = 300,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `${disposition}; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/** Remove an object (used when rolling back a failed candidate insert). */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
