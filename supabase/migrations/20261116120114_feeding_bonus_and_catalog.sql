-- Preserve old collections and upload receipts while adding a one-time feeding bonus.
alter table public.collections add column fed boolean not null default false;

create function public.complete_collection_v2(
 p_user uuid,p_request uuid,p_name text,p_notes text,p_visibility text,
 p_lat double precision,p_lng double precision,p_reward integer,p_fed boolean,p_bonus integer
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare receipt operations; job upload_jobs; item collections; result jsonb; bonus integer; total integer;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into receipt from operations where user_id=p_user and request_id=p_request;
 if found then
  if receipt.kind<>'collection' then raise exception 'REQUEST_CONFLICT'; end if;
  select * into item from collections where id=(receipt.result->>'id')::uuid and user_id=p_user and deleted_at is null;
  if not found then raise exception 'REQUEST_ALREADY_USED'; end if;
  return to_jsonb(item)||jsonb_build_object('reward',0,'base_reward',0,'feeding_bonus',0,'replayed',true);
 end if;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request for update;
 if not found or job.cleaning then raise exception 'UPLOAD_NOT_READY'; end if;
 if p_reward is null or p_reward<0 or p_reward>10000 or p_bonus is null or p_bonus<0 or p_bonus>10000 or p_fed is null then raise exception 'INVALID_REWARD'; end if;
 bonus:=case when p_fed then p_bonus else 0 end;
 total:=p_reward+bonus;
 insert into collections(user_id,name,notes,visibility,photo_path,latitude,longitude,fed)
  values(p_user,p_name,p_notes,p_visibility,job.photo_path,p_lat,p_lng,p_fed) returning * into item;
 update profiles set coins=coins+total where id=p_user;
 insert into coin_transactions(user_id,amount,reason,request_id) values(p_user,total,'collection',p_request);
 result:=to_jsonb(item)||jsonb_build_object('reward',total,'base_reward',p_reward,'feeding_bonus',bonus,'replayed',false);
 insert into operations values(p_user,p_request,'collection',result||jsonb_build_object('content_hash',job.content_hash),now());
 delete from upload_jobs where user_id=p_user and request_id=p_request;
 return result;
end; $$;
revoke all on function public.complete_collection_v2(uuid,uuid,text,text,text,double precision,double precision,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.complete_collection_v2(uuid,uuid,text,text,text,double precision,double precision,integer,boolean,integer) to service_role;


alter table public.pets add column fed_at timestamptz;

create function public.feed_pet(p_user uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare previous operations; item pets; result jsonb; before_energy integer;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
  if previous.kind<>'feed' then raise exception 'REQUEST_CONFLICT'; end if;
  select * into item from pets where user_id=p_user;
  return jsonb_build_object('pet',to_jsonb(item),'replayed',true,'energy_added',0);
 end if;
 select * into item from pets where user_id=p_user;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.fed_at>now()-interval '30 seconds' then raise exception 'FEED_COOLDOWN'; end if;
 perform settle_pet(p_user);
 select energy into before_energy from pets where user_id=p_user;
 update pets set energy=least(100,energy+20),fed_at=now() where user_id=p_user returning * into item;
 result:=jsonb_build_object('pet',to_jsonb(item),'replayed',false,'energy_added',item.energy-before_energy);
 insert into operations values(p_user,p_request,'feed',result,now());
 return result;
end; $$;
revoke all on function public.feed_pet(uuid,uuid) from public,anon,authenticated;
grant execute on function public.feed_pet(uuid,uuid) to service_role;

create or replace function public.play_pet(p_user uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare previous operations; last_play timestamptz; result jsonb;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
  if previous.kind<>'play' then raise exception 'REQUEST_CONFLICT'; end if;
  return previous.result;
 end if;
 select played_at into last_play from pets where user_id=p_user;
 if last_play>now()-interval '30 seconds' then raise exception 'PLAY_COOLDOWN'; end if;
 perform settle_pet(p_user);
 update pets set happiness=least(100,happiness+15),played_at=now() where user_id=p_user;
 result:=jsonb_build_object('happiness_added',15);
 insert into operations values(p_user,p_request,'play',result,now());
 return result;
end; $$;

-- New sales contain only the original Figma cosmetics. Keep all old ownership intact.
insert into public.products(id,name,category,description,price,emoji,effect,slot,archived) values
 ('topi-navy-logo','Topi navy emblem','accessory','Topi navy emblem dari koleksi Figma.',60,'🧢',0,'head',false),
 ('topi-putih','Topi putih','accessory','Topi putih dari koleksi Figma.',60,'🧢',0,'head',false),
 ('topi-krem-logo','Topi krem logo','accessory','Topi krem logo dari koleksi Figma.',60,'🧢',0,'head',false),
 ('topi-hitam','Topi hitam','accessory','Topi hitam dari koleksi Figma.',60,'🧢',0,'head',false),
 ('bingkai-hitam','Bingkai hitam','accessory','Bingkai hitam dari koleksi Figma.',50,'👓',0,'face',false)
on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,emoji=excluded.emoji,effect=excluded.effect,slot=excluded.slot,archived=false,active=true;
update public.products set archived=true where id not in ('topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam');
update public.products set archived=false,active=true where id in ('topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam');

create or replace function public.backend_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('schemaVersion',4,'database',true,'catalogReady',
  (select count(*)=11 from products where active and not archived and category='accessory' and id in ('topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam'))
  and not exists(select 1 from products where active and not archived and id not in ('topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam')));
$$;

