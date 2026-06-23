import multer from 'multer';
import { maxUploadBytes } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * In-memory upload for the candidate resume. The buffer is streamed to S3 in the
 * controller. PDF-only, capped at MAX_UPLOAD_MB.
 */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(ApiError.badRequest('Resume must be a PDF (application/pdf).'));
      return;
    }
    cb(null, true);
  },
}).single('resume');
