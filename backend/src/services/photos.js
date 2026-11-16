import sharp from 'sharp';
import multer from 'multer';
import { AppError } from '../errors.js';
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 6, parts: 7 },
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      return cb(new AppError('INVALID_IMAGE', 'Gunakan foto JPEG, PNG, atau WebP.', 415));
    cb(null, true);
  },
}).single('photo');
export async function normalizePhoto(file) {
  if (!file) throw new AppError('PHOTO_REQUIRED', 'Ambil foto terlebih dahulu.', 400);
  try {
    const image = sharp(file.buffer, { limitInputPixels: 40000000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Invalid format');
    return await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(
      'INVALID_IMAGE',
      'File foto tidak dapat dibaca atau ukurannya terlalu besar.',
      415
    );
  }
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
