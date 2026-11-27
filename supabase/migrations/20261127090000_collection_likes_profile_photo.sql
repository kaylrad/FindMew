-- Likes on other explorers' public collections, plus an uploaded profile photo.
-- Deploy this migration together with the matching backend (schemaVersion 6).

-- A denormalized counter keeps list/map queries to a single table read.
alter table public.collections add column like_count integer not null default 0 check(like_count>=0);
create table public.collection_likes (
 collection_id uuid not null references public.collections(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(collection_id,user_id)
);
create index collection_likes_user_idx on public.collection_likes(user_id,collection_id);
alter table public.collection_likes enable row level security;
create policy deny_client_collection_likes on public.collection_likes for all to anon,authenticated using(false) with check(false);
revoke all on public.collection_likes from anon,authenticated;
grant all on public.collection_likes to service_role;

-- Liking is idempotent: repeating a like or unlike never moves the counter twice.
create function public.set_collection_like(p_user uuid,p_collection uuid,p_liked boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item collections; changed integer;
begin
 if p_liked is null then raise exception 'INVALID_LIKE'; end if;
 select * into item from collections where id=p_collection and deleted_at is null and visibility='public' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.user_id=p_user then raise exception 'OWN_COLLECTION_LIKE'; end if;
 if p_liked then
  insert into collection_likes(collection_id,user_id) values(p_collection,p_user) on conflict do nothing;
 else
  delete from collection_likes where collection_id=p_collection and user_id=p_user;
 end if;
 get diagnostics changed = row_count;
 if changed>0 then
  update collections set like_count=greatest(0,like_count+case when p_liked then 1 else -1 end)
   where id=p_collection returning * into item;
 end if;
 return jsonb_build_object('id',item.id,'liked',p_liked,'like_count',item.like_count);
end; $$;
revoke all on function public.set_collection_like(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_collection_like(uuid,uuid,boolean) to service_role;

-- The photo lives in the private bucket at profiles/<user id>.webp; null means "use the emoji avatar".
alter table public.profiles add column photo_updated_at timestamptz;

create or replace function public.backend_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('schemaVersion',6,'database',true,'catalogReady',
  (select count(*)=12 and bool_and(price=case when id='makanan' then 3 when id in ('topi-navy-logo','topi-krem-logo') then 70 when slot='face' then 60 else 50 end)
   from products where active and not archived and id in ('makanan','topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam'))
  and (select category='food' and effect=20 from products where id='makanan')
  and not exists(select 1 from products where active and not archived and id not in ('makanan','topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam')));
$$;
