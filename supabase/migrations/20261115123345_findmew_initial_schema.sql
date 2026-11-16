-- Execute in Supabase SQL Editor as postgres. Application writes are server-only.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default 'Teman Mew' check(length(name) between 1 and 60),
 username text unique check(username ~ '^[a-z0-9_]{3,24}$'), bio text not null default '' check(length(bio)<=280),
 avatar text not null default '🐱', coins integer not null default 150 check(coins>=0), created_at timestamptz not null default now()
);
create table public.pets (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 name text not null default 'Mochi' check(length(name) between 1 and 40),
 energy integer not null default 80 check(energy between 0 and 100), clean integer not null default 85 check(clean between 0 and 100), happiness integer not null default 90 check(happiness between 0 and 100),
 updated_at timestamptz not null default now(), played_at timestamptz
);
create table public.products (
 id text primary key, name text not null, category text not null check(category in ('food','care','accessory')),
 description text not null, price integer not null check(price>0), emoji text not null,
 effect integer not null default 0 check(effect between 0 and 100), slot text check(slot in ('neck','head')),
 active boolean not null default true
);
create table public.inventory (
 user_id uuid references public.profiles(id) on delete cascade, product_id text references public.products(id),
 quantity integer not null check(quantity>=0), primary key(user_id,product_id)
);
create table public.equipped_accessories (
 user_id uuid references public.profiles(id) on delete cascade, slot text not null check(slot in ('head','neck')),
 product_id text not null references public.products(id), primary key(user_id,slot)
);
create table public.collections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), notes text not null default '' check(length(notes)<=1000),
 visibility text not null default 'private' check(visibility in ('public','private')), photo_path text not null unique,
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check((latitude is null) = (longitude is null))
);
create index collections_owner_date on public.collections(user_id,created_at desc) where deleted_at is null;
create index collections_public_geo on public.collections(created_at desc) where visibility='public' and latitude is not null and deleted_at is null;
-- Durable receipts survive collection deletion, preventing reuse of reward IDs.
create table public.operations (
 user_id uuid references public.profiles(id) on delete cascade, request_id uuid not null,
 kind text not null, result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,request_id)
);
create table public.purchases (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 product_id text not null references public.products(id), price integer not null check(price>0),
 request_id uuid not null, created_at timestamptz not null default now(), unique(user_id,request_id)
);
create table public.coin_transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 amount integer not null, reason text not null, request_id uuid not null, created_at timestamptz not null default now(), unique(user_id,request_id)
);
-- A durable outbox spans the Database/Storage boundary. Retry cleanup after failures/restarts.
create table public.upload_jobs (
 user_id uuid references public.profiles(id) on delete cascade, request_id uuid not null,
 photo_path text not null unique, content_hash text not null,
 created_at timestamptz not null default now(), touched_at timestamptz not null default now(), cleaning boolean not null default false, primary key(user_id,request_id)
);
create table public.storage_gc (
 id uuid primary key default gen_random_uuid(), collection_id uuid not null unique references public.collections(id),
 photo_path text not null, created_at timestamptz not null default now()
);

create function public.initialize_user(p_user uuid, p_name text default 'Teman Mew') returns void
language plpgsql security definer set search_path = public as $$
begin
 insert into profiles(id,name,username) values(p_user,left(coalesce(nullif(p_name,''),'Teman Mew'),60),'mew_'||replace(p_user::text,'-','')::varchar(20)) on conflict(id) do nothing;
 insert into pets(user_id) values(p_user) on conflict do nothing;
 insert into inventory(user_id,product_id,quantity) select p_user,id,2 from products where id in ('tuna','shampoo') on conflict do nothing;
end; $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin perform initialize_user(new.id,coalesce(new.raw_user_meta_data->>'name','Teman Mew')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Timestamp decay is materialized only during a mutation, never on a timer.
create function public.settle_pet(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
 update pets set energy=greatest(0,energy-floor(greatest(0,extract(epoch from(now()-updated_at)))/3600*2)::integer),
 clean=greatest(0,clean-floor(greatest(0,extract(epoch from(now()-updated_at)))/3600)::integer),
 happiness=greatest(0,happiness-floor(greatest(0,extract(epoch from(now()-updated_at)))/3600*1.5)::integer), updated_at=now() where user_id=p_user;
end; $$;

create function public.reserve_upload(p_user uuid,p_request uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare job upload_jobs; previous operations;
begin
 perform 1 from profiles where id=p_user for update;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
   if previous.kind<>'collection' or previous.result->>'content_hash'<>p_hash then raise exception 'REQUEST_CONFLICT'; end if;
   return jsonb_build_object('completed',true);
 end if;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request for update;
 if found then
   if job.cleaning then raise exception 'UPLOAD_NOT_READY'; end if;
   if job.content_hash<>p_hash then raise exception 'REQUEST_CONFLICT'; end if;
   update upload_jobs set touched_at=now() where user_id=p_user and request_id=p_request;
 else
   insert into upload_jobs(user_id,request_id,photo_path,content_hash) values(p_user,p_request,p_user::text||'/'||p_request::text||'.webp',p_hash) returning * into job;
 end if;
 return jsonb_build_object('photo_path',job.photo_path,'completed',false);
end; $$;
create function public.claim_abandoned_upload(p_user uuid,p_request uuid) returns text
language plpgsql security definer set search_path = public as $$
declare job upload_jobs;
begin
 perform 1 from profiles where id=p_user for update;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request for update;
 if not found or (not job.cleaning and job.touched_at>now()-interval '24 hours') then return null; end if;
 if exists(select 1 from collections where photo_path=job.photo_path) then delete from upload_jobs where user_id=p_user and request_id=p_request;return null;end if;
 update upload_jobs set cleaning=true where user_id=p_user and request_id=p_request;
 return job.photo_path;
end; $$;

create function public.complete_collection(p_user uuid,p_request uuid,p_name text,p_notes text,p_visibility text,p_lat double precision,p_lng double precision,p_reward integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare receipt operations; job upload_jobs; item collections; result jsonb;
begin
 perform 1 from profiles where id=p_user for update;
 select * into receipt from operations where user_id=p_user and request_id=p_request;
 if found then
   if receipt.kind<>'collection' then raise exception 'REQUEST_CONFLICT'; end if;
   select * into item from collections where id=(receipt.result->>'id')::uuid and deleted_at is null;
   if not found then raise exception 'REQUEST_ALREADY_USED'; end if;
   return to_jsonb(item)||jsonb_build_object('reward',0,'replayed',true);
 end if;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request for update;
 if not found then raise exception 'UPLOAD_NOT_READY'; end if;
 if job.cleaning then raise exception 'UPLOAD_NOT_READY'; end if;
 if p_reward<0 or p_reward>10000 then raise exception 'INVALID_REWARD'; end if;
 insert into collections(user_id,name,notes,visibility,photo_path,latitude,longitude) values(p_user,p_name,p_notes,p_visibility,job.photo_path,p_lat,p_lng) returning * into item;
 update profiles set coins=coins+p_reward where id=p_user;
 insert into coin_transactions(user_id,amount,reason,request_id) values(p_user,p_reward,'collection',p_request);
 result:=to_jsonb(item)||jsonb_build_object('reward',p_reward,'replayed',false);
 insert into operations values(p_user,p_request,'collection',result||jsonb_build_object('content_hash',job.content_hash),now());
 delete from upload_jobs where user_id=p_user and request_id=p_request;
 return result;
end; $$;

create function public.buy_product(p_user uuid,p_product text,p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare product products; balance integer; previous operations; result jsonb;
begin
 select coins into balance from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
   if previous.kind<>'purchase' or previous.result->>'product_id'<>p_product then raise exception 'REQUEST_CONFLICT'; end if;
   return previous.result||jsonb_build_object('replayed',true);
 end if;
 select * into product from products where id=p_product and active=true;
 if not found then raise exception 'NOT_FOUND'; end if;
 if balance<product.price then raise exception 'INSUFFICIENT_COINS'; end if;
 if product.category='accessory' and exists(select 1 from inventory where user_id=p_user and product_id=p_product and quantity>0) then raise exception 'ALREADY_OWNED'; end if;
 update profiles set coins=coins-product.price where id=p_user returning coins into balance;
 insert into inventory values(p_user,p_product,1) on conflict(user_id,product_id) do update set quantity=inventory.quantity+1;
 insert into purchases(user_id,product_id,price,request_id) values(p_user,p_product,product.price,p_request);
 insert into coin_transactions(user_id,amount,reason,request_id) values(p_user,-product.price,'purchase',p_request);
 result:=jsonb_build_object('product_id',p_product,'coins',balance);
 insert into operations values(p_user,p_request,'purchase',result,now());
 return result;
end; $$;
create function public.use_product(p_user uuid,p_product text,p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare product products; stock integer; previous operations; result jsonb;
begin
 perform 1 from profiles where id=p_user for update;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
   if previous.kind<>'use' or previous.result->>'product_id'<>p_product then raise exception 'REQUEST_CONFLICT'; end if;
   return previous.result||jsonb_build_object('replayed',true);
 end if;
 select * into product from products where id=p_product and category in ('food','care');
 if not found then raise exception 'NOT_FOUND'; end if;
 select quantity into stock from inventory where user_id=p_user and product_id=p_product for update;
 if coalesce(stock,0)<1 then raise exception 'OUT_OF_STOCK'; end if;
 perform settle_pet(p_user);
 update inventory set quantity=quantity-1 where user_id=p_user and product_id=p_product;
 update pets set energy=least(100,energy+case when product.category='food' then product.effect else 0 end), clean=least(100,clean+case when product.category='care' then product.effect else 0 end) where user_id=p_user;
 result:=jsonb_build_object('product_id',p_product,'quantity',stock-1);
 insert into operations values(p_user,p_request,'use',result,now());
 return result;
end; $$;
create function public.play_pet(p_user uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare previous operations; last_play timestamptz; result jsonb;
begin
 perform 1 from profiles where id=p_user for update;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
   if previous.kind<>'play' then raise exception 'REQUEST_CONFLICT'; end if;
   return previous.result;
 end if;
 select played_at into last_play from pets where user_id=p_user;
 if last_play>now()-interval '10 seconds' then raise exception 'PLAY_COOLDOWN'; end if;
 perform settle_pet(p_user);
 update pets set happiness=least(100,happiness+15),played_at=now() where user_id=p_user;
 result:=jsonb_build_object('happiness_added',15);
 insert into operations values(p_user,p_request,'play',result,now()); return result;
end; $$;
create function public.equip_product(p_user uuid,p_product text,p_equipped boolean) returns void
language plpgsql security definer set search_path = public as $$
declare product products;
begin
 perform 1 from profiles where id=p_user for update;
 select * into product from products where id=p_product and category='accessory';
 if not found then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from inventory where user_id=p_user and product_id=p_product and quantity>0) then raise exception 'OUT_OF_STOCK'; end if;
 if p_equipped then insert into equipped_accessories values(p_user,product.slot,p_product) on conflict(user_id,slot) do update set product_id=excluded.product_id;
 else delete from equipped_accessories where user_id=p_user and product_id=p_product; end if;
end; $$;
create function public.begin_collection_delete(p_user uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare item collections; job storage_gc;
begin
 select * into item from collections where id=p_id and user_id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 update collections set deleted_at=coalesce(deleted_at,now()) where id=p_id;
 insert into storage_gc(collection_id,photo_path) values(p_id,item.photo_path) on conflict(collection_id) do update set photo_path=excluded.photo_path returning * into job;
 return to_jsonb(job);
end; $$;
create function public.finish_collection_delete(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
 delete from storage_gc where id=p_job returning collection_id into target;
 if target is not null then delete from collections where id=target and deleted_at is not null; end if;
end; $$;

-- Public clients can read only their own state. All writes and all RPCs go through Express.
alter table profiles enable row level security;
alter table pets enable row level security;
alter table collections enable row level security;
alter table products enable row level security;
alter table inventory enable row level security;
alter table equipped_accessories enable row level security;
alter table purchases enable row level security;
alter table coin_transactions enable row level security;
alter table operations enable row level security;
alter table upload_jobs enable row level security;
alter table storage_gc enable row level security;
create policy own_profile on profiles for select to authenticated using(id=auth.uid());
create policy own_pet on pets for select to authenticated using(user_id=auth.uid());
create policy own_collections on collections for select to authenticated using(user_id=auth.uid() and deleted_at is null);
create policy catalog_read on products for select to authenticated using(active=true);
create policy own_inventory on inventory for select to authenticated using(user_id=auth.uid());
create policy own_accessories on equipped_accessories for select to authenticated using(user_id=auth.uid());
create policy own_purchases on purchases for select to authenticated using(user_id=auth.uid());
create policy own_coins on coin_transactions for select to authenticated using(user_id=auth.uid());
revoke all on all tables in schema public from anon,authenticated;
grant select on profiles,pets,collections,products,inventory,equipped_accessories,purchases,coin_transactions to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cat-photos','cat-photos',false,6291456,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- No client write/read policies: private images are served by the authorized Express photo endpoint.
