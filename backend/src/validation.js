import { z } from 'zod';
import { catTypes, rooms, products } from './services/catalog.js';
export const idSchema = z.string().uuid();
const coordinate = z.preprocess(
  (v) => (v === '' || v == null ? null : Number(v)),
  z.number().finite().nullable()
);
export const collectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    notes: z.string().trim().max(1000).default(''),
    visibility: z.enum(['private', 'public']).default('private'),
    latitude: coordinate.refine((v) => v == null || Math.abs(v) <= 90),
    longitude: coordinate.refine((v) => v == null || Math.abs(v) <= 180),
    fed: z.preprocess(
      (value) =>
        value === undefined ? false : value === 'true' ? true : value === 'false' ? false : value,
      z.boolean()
    ),
  })
  .strict()
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: 'Lokasi harus memiliki latitude dan longitude.',
  });
const nonempty = (schema) =>
  schema
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: 'Isi setidaknya satu perubahan.' });
export const collectionPatchSchema = nonempty(
  z
    .object({
      name: z.string().trim().min(1).max(80),
      notes: z.string().trim().max(1000),
      visibility: z.enum(['private', 'public']),
    })
    .strict()
);
export const profilePatchSchema = nonempty(
  z
    .object({
      name: z.string().trim().min(1).max(60),
      username: z.string().regex(/^[a-z0-9_]{3,24}$/),
      bio: z.string().trim().max(280),
      avatar: z.enum(['🐱', '🐈', '🌼', '🌿', '🍑', '🐾']),
    })
    .strict()
);
export const petPatchSchema = nonempty(
  z
    .object({
      name: z.string().trim().min(1).max(40),
      cat_type_id: z.enum(catTypes.map((item) => item.id)),
      room_id: z.enum(rooms.map((item) => item.id)),
    })
    .strict()
);
export const productSchema = z.object({ product_id: z.string().min(1).max(60) }).strict();
export const feedSchema = z.object({ product_id: z.string().min(1).max(60).optional() }).strict();
export const accessorySchema = productSchema.extend({ equipped: z.boolean() });
export const accessoryLoadoutSchema = z
  .object({ product_ids: z.array(z.string().min(1).max(60)).max(2) })
  .strict()
  .superRefine(({ product_ids }, ctx) => {
    const slots = new Set();
    for (const id of product_ids) {
      const product = products.find(
        (item) =>
          item.id === id && item.category === 'accessory' && ['head', 'face'].includes(item.slot)
      );
      if (!product || slots.has(product.slot)) {
        ctx.addIssue({
          code: 'custom',
          path: ['product_ids'],
          message: 'Pilih maksimal satu aksesoris kepala dan satu kacamata yang valid.',
        });
        return;
      }
      slots.add(product.slot);
    }
  });
export const paginationSchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const pagination = (req) => paginationSchema.parse(req.query);
export const requestKey = (req) => idSchema.parse(req.get('Idempotency-Key'));
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
