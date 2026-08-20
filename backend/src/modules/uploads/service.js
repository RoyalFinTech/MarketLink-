// src/modules/uploads/service.js
// Storage abstraction: local (dev) + cloud (prod).
// Cloud: set STORAGE_PROVIDER=s3|cloudinary|backblaze and matching env vars.
'use strict';
const path = require('path');
const fs   = require('fs');
const { query } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const ALLOWED_DOC_TYPES   = ['application/pdf','image/jpeg','image/png'];
const MAX_IMAGE_SIZE = 5  * 1024 * 1024; // 5MB
const MAX_DOC_SIZE   = 10 * 1024 * 1024; // 10MB

function validateFile(file, purpose) {
  const isDoc = purpose.includes('document') || purpose.includes('doc');
  const allowed = isDoc ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;
  const maxSize = isDoc ? MAX_DOC_SIZE : MAX_IMAGE_SIZE;
  if (!allowed.includes(file.mimetype))
    throw new AppError(`File type ${file.mimetype} is not allowed for ${purpose}.`, 400, 'INVALID_FILE_TYPE');
  if (file.size > maxSize)
    throw new AppError(`File too large. Maximum size is ${maxSize/1024/1024}MB.`, 400, 'FILE_TOO_LARGE');
}

async function uploadLocal(file, purpose, uploaderId) {
  const uploadsDir = path.join(process.cwd(), 'uploads', purpose);
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, file.buffer);
  const url = `/uploads/${purpose}/${filename}`;
  logger.info('File stored locally', { url, purpose, uploaderId });
  return url;
}

async function uploadCloud(file, purpose) {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === 's3') {
    if (!process.env.AWS_S3_BUCKET)
      throw new AppError('AWS_S3_BUCKET not configured. Add it to .env', 503, 'STORAGE_NOT_CONFIGURED');
    // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    // const s3 = new S3Client({ region: process.env.AWS_REGION });
    // const key = `${purpose}/${Date.now()}-${file.originalname}`;
    // await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    // return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
    throw new AppError('S3 requires @aws-sdk/client-s3 package and AWS credentials in .env', 503, 'STORAGE_NOT_CONFIGURED');
  }
  if (provider === 'cloudinary') {
    if (!process.env.CLOUDINARY_CLOUD_NAME)
      throw new AppError('Cloudinary credentials not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env', 503, 'STORAGE_NOT_CONFIGURED');
    throw new AppError('Cloudinary requires cloudinary package and credentials in .env', 503, 'STORAGE_NOT_CONFIGURED');
  }
  throw new AppError(`STORAGE_PROVIDER "${provider}" is not supported. Use: s3, cloudinary, or leave unset for local.`, 503, 'STORAGE_NOT_CONFIGURED');
}

async function upload(file, purpose, uploaderId) {
  validateFile(file, purpose);
  const useCloud = !!process.env.STORAGE_PROVIDER;
  const url = useCloud
    ? await uploadCloud(file, purpose)
    : await uploadLocal(file, purpose, uploaderId);

  const { rows: [record] } = await query(
    `INSERT INTO file_uploads (uploaded_by, file_url, file_type, purpose, file_size_kb)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [uploaderId||null, url,
     ALLOWED_IMAGE_TYPES.includes(file.mimetype) ? 'image' : 'document',
     purpose, Math.round(file.size/1024)]);

  return { url, record };
}

async function deleteFile(fileId, requesterId, roles) {
  const { rows: [f] } = await query('SELECT * FROM file_uploads WHERE id = $1', [fileId]);
  if (!f) throw new AppError('File not found.', 404, 'FILE_NOT_FOUND');
  const isAdmin = (roles||[]).some(r => ['admin','super_admin'].includes(r));
  if (!isAdmin && f.uploaded_by !== requesterId)
    throw new AppError('Not authorised to delete this file.', 403, 'FORBIDDEN');

  if (!process.env.STORAGE_PROVIDER && f.file_url.startsWith('/uploads/')) {
    const localPath = path.join(process.cwd(), f.file_url);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
  await query('UPDATE file_uploads SET deleted_at = now() WHERE id = $1', [fileId]);
  return { deleted: true, id: fileId };
}

module.exports = { upload, deleteFile, validateFile };
