import type express from 'express';
import multer from 'multer';
import path from 'node:path';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const hasValidUploadSignature = (file: Express.Multer.File) => {
  if (file.mimetype === MIME_BY_EXTENSION['.pdf']) {
    return file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  }
  if (file.mimetype === MIME_BY_EXTENSION['.docx']) {
    return file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
  return false;
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (
    _req: express.Request,
    file: Express.Multer.File,
    callback: multer.FileFilterCallback,
  ) => {
    if (MIME_BY_EXTENSION[path.extname(file.originalname).toLowerCase()] !== file.mimetype) {
      return callback(new Error('Unsupported file type'));
    }

    return callback(null, true);
  },
});
