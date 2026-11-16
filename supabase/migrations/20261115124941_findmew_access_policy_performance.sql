alter policy own_profile on public.profiles using(id=(select auth.uid()));
alter policy own_pet on public.pets using(user_id=(select auth.uid()));
alter policy own_collections on public.collections using(user_id=(select auth.uid()) and deleted_at is null);
alter policy own_inventory on public.inventory using(user_id=(select auth.uid()));
alter policy own_accessories on public.equipped_accessories using(user_id=(select auth.uid()));
alter policy own_purchases on public.purchases using(user_id=(select auth.uid()));
alter policy own_coins on public.coin_transactions using(user_id=(select auth.uid()));
create index inventory_product_id_idx on public.inventory(product_id);
create index equipped_accessories_product_id_idx on public.equipped_accessories(product_id);
create index purchases_product_id_idx on public.purchases(product_id);
-- These bookkeeping tables are accessed only through the Express service role.
create policy deny_client_operations on public.operations for all to anon,authenticated using(false) with check(false);
create policy deny_client_upload_jobs on public.upload_jobs for all to anon,authenticated using(false) with check(false);
create policy deny_client_storage_gc on public.storage_gc for all to anon,authenticated using(false) with check(false);
