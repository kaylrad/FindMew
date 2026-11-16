import { Router } from 'express';
import {
  asyncRoute,
  pagination,
  idSchema,
  requestKey,
  profilePatchSchema,
  petPatchSchema,
  productSchema,
  feedSchema,
  accessorySchema,
  accessoryLoadoutSchema,
} from '../validation.js';
export function accountRoutes(store) {
  const router = Router();
  router.get(
    '/me',
    asyncRoute(async (req, res) => res.json(await store.state(req.user.id)))
  );
  router.get(
    '/explore/map',
    asyncRoute(async (req, res) => res.json(await store.exploreMap(req.user.id, pagination(req))))
  );
  router.get(
    '/explore/map/:id',
    asyncRoute(async (req, res) =>
      res.json(await store.mapDetail(req.user.id, idSchema.parse(req.params.id)))
    )
  );
  router.patch(
    '/profile',
    asyncRoute(async (req, res) =>
      res.json(await store.updateProfile(req.user.id, profilePatchSchema.parse(req.body)))
    )
  );
  router.get(
    '/pet',
    asyncRoute(async (req, res) => res.json((await store.state(req.user.id)).pet))
  );
  router.patch(
    '/pet',
    asyncRoute(async (req, res) =>
      res.json(await store.updatePet(req.user.id, petPatchSchema.parse(req.body)))
    )
  );
  router.post(
    '/pet/play',
    asyncRoute(async (req, res) => res.json(await store.play(req.user.id, requestKey(req))))
  );
  router.post(
    '/pet/feed',
    asyncRoute(async (req, res) => {
      const { product_id } = feedSchema.parse(req.body);
      res.json(await store.feed(req.user.id, requestKey(req), product_id));
    })
  );
  router.get(
    '/store',
    asyncRoute(async (req, res) => res.json((await store.state(req.user.id)).products))
  );
  router.get(
    '/inventory',
    asyncRoute(async (req, res) => {
      const { inventory, equipped } = await store.state(req.user.id);
      res.json({ inventory, equipped });
    })
  );
  router.get(
    '/purchases',
    asyncRoute(async (req, res) =>
      res.json(await store.history(req.user.id, 'purchases', pagination(req)))
    )
  );
  router.get(
    '/transactions',
    asyncRoute(async (req, res) =>
      res.json(await store.history(req.user.id, 'coin_transactions', pagination(req)))
    )
  );
  router.post(
    '/purchases',
    asyncRoute(async (req, res) =>
      res.json(
        await store.buy(req.user.id, productSchema.parse(req.body).product_id, requestKey(req))
      )
    )
  );
  router.post(
    '/inventory/use',
    asyncRoute(async (req, res) =>
      res.json(
        await store.use(req.user.id, productSchema.parse(req.body).product_id, requestKey(req))
      )
    )
  );
  router.put(
    '/accessories',
    asyncRoute(async (req, res) => {
      const { product_id, equipped } = accessorySchema.parse(req.body);
      res.json(await store.equip(req.user.id, product_id, equipped));
    })
  );
  router.put(
    '/accessories/loadout',
    asyncRoute(async (req, res) =>
      res.json(
        await store.equipLoadout(req.user.id, accessoryLoadoutSchema.parse(req.body).product_ids)
      )
    )
  );
  return router;
}
