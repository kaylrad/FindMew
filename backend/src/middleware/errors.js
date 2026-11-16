import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import multer from 'multer';
import { AppError } from '../errors.js';
export function requestContext(req, res, next) {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('Cache-Control', 'no-store');
  next();
}
export function errorHandler(logger = console) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    let err = error;
    if (err instanceof z.ZodError)
      err = new AppError('VALIDATION_ERROR', 'Periksa isian dan parameter permintaan.', 400);
    else if (err instanceof multer.MulterError)
      err = new AppError('UPLOAD_LIMIT', 'Maksimal satu foto 4 MB, dengan field yang sesuai.', 400);
    else if (err.type === 'entity.parse.failed')
      err = new AppError('INVALID_JSON', 'Isi permintaan harus berupa JSON yang valid.', 400);
    else if (err.type === 'entity.too.large')
      err = new AppError('PAYLOAD_TOO_LARGE', 'Isi permintaan terlalu besar.', 413);
    else if (['encoding.unsupported', 'charset.unsupported'].includes(err.type))
      err = new AppError('UNSUPPORTED_ENCODING', 'Encoding permintaan tidak didukung.', 415);
    if (!(err instanceof AppError)) {
      logger.error?.({
        event: 'request_failed',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
      });
      err = new AppError('INTERNAL_ERROR', 'Terjadi gangguan. Silakan coba lagi.', 500);
    }
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, requestId: req.requestId } });
  };
}
