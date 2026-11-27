import sharp from 'sharp';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AppError } from '../errors.js';
const imageUpload = (fields) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1, fields, parts: fields + 1 },
    fileFilter(req, file, cb) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
        return cb(new AppError('INVALID_IMAGE', 'Gunakan foto JPEG, PNG, atau WebP.', 415));
      cb(null, true);
    },
  }).single('photo');
export const photoUpload = imageUpload(6);
// A profile photo request carries the image only.
export const profilePhotoUpload = imageUpload(0);
async function normalize(file, resize) {
  if (!file) throw new AppError('PHOTO_REQUIRED', 'Ambil foto terlebih dahulu.', 400);
  try {
    const image = sharp(file.buffer, { limitInputPixels: 40000000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Invalid format');
    return await image.rotate().resize(resize).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new AppError(
      'INVALID_IMAGE',
      'File foto tidak dapat dibaca atau ukurannya terlalu besar.',
      415
    );
  }
}
export const normalizePhoto = (file) =>
  normalize(file, { width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
// Profile photos are shown in a circle, so they are stored as a centred square.
export const normalizeProfilePhoto = (file) =>
  normalize(file, { width: 512, height: 512, fit: 'cover', position: 'attention' });
export function uploadRateLimit(limit) {
  return rateLimit({
    windowMs: 60000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler(req, res, next) {
      next(
        new AppError(
          'UPLOAD_RATE_LIMITED',
          'Terlalu banyak upload. Tunggu sebentar lalu coba lagi.',
          429,
          { retryAfter: 60 }
        )
      );
    },
  });
}
export function requireMultipart(req, res, next) {
  if (!req.is('multipart/form-data'))
    return next(new AppError('MULTIPART_REQUIRED', 'Kirim foto sebagai multipart/form-data.', 415));
  next();
}
export function uploadCapacity(maximum = 2) {
  let active = 0;
  return (req, res, next) => {
    if (active >= maximum)
      return next(
        new AppError('UPLOAD_BUSY', 'Upload sedang ramai. Coba lagi sebentar.', 503, {
          retryAfter: 3,
        })
      );
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    req.releaseUpload = release;
    res.once('finish', release);
    res.once('close', () => {
      if (!req.uploadProcessing) release();
    });
    next();
  };
}
