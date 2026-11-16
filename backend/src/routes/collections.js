import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { AppError } from '../errors.js';
import { backendRoot } from '../config.js';
import {
  asyncRoute,
  idSchema,
  pagination,
  requestKey,
  collectionSchema,
  collectionPatchSchema,
} from '../validation.js';
import { photoUpload, normalizePhoto, uploadCapacity } from '../services/photos.js';
import { uploadHash } from '../services/supabase.js';

export async function sendPhoto(res, photo) {
  res.type(photo.sample ? 'jpg' : 'webp');
  if (photo.sample)
    res.sendFile(path.resolve(backendRoot, `../frontend/public/photos/${photo.sample}.jpg`));
  else res.send(photo.buffer);
}
export function collectionRoutes(store, config) {
  const router = Router();
  router.get(
    '/',
    asyncRoute(async (req, res) => res.json(await store.list(req.user.id, pagination(req))))
  );
  const uploadLimit = rateLimit({
    windowMs: 60000,
    limit: config.uploadRateLimit,
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
  router.post(
    '/',
    (req, res, next) => {
      try {
        req.operationId = requestKey(req);
        if (!req.is('multipart/form-data'))
          throw new AppError('MULTIPART_REQUIRED', 'Kirim foto sebagai multipart/form-data.', 415);
        next();
      } catch (e) {
        next(e);
      }
    },
    uploadLimit,
    uploadCapacity(config.maxUploads),
    photoUpload,
    asyncRoute(async (req, res) => {
      if (req.aborted || res.destroyed) {
        req.releaseUpload?.();
        return;
      }
      req.uploadProcessing = true;
      try {
        const data = collectionSchema.parse(req.body),
          photo = await normalizePhoto(req.file);
        const row = await store.createCollection(
          req.user.id,
          data,
          photo,
          req.operationId,
          uploadHash(photo, data)
        );
        res.status(row.replayed ? 200 : 201).json(row);
      } finally {
        req.releaseUpload?.();
      }
    })
  );
  router.get(
    '/:id',
    asyncRoute(async (req, res) =>
      res.json(await store.detail(req.user.id, idSchema.parse(req.params.id)))
    )
  );
  router.patch(
    '/:id',
    asyncRoute(async (req, res) =>
      res.json(
        await store.updateCollection(
          req.user.id,
          idSchema.parse(req.params.id),
          collectionPatchSchema.parse(req.body)
        )
      )
    )
  );
  router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
      const result = await store.deleteCollection(req.user.id, idSchema.parse(req.params.id));
      res.status(result.pending ? 202 : 200).json(result);
    })
  );
  router.get(
    '/:id/photo',
    asyncRoute(async (req, res) =>
      sendPhoto(res, await store.photo(req.user.id, idSchema.parse(req.params.id)))
    )
  );
  return router;
}
