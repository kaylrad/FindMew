-- Apply after 202611150001. Deploy this migration and the matching backend together.
-- Preserve fractional elapsed decay when another interaction materializes pet status.
alter table public.pets add column energy_remainder double precision not null default 0 check(energy_remainder>=0 and energy_remainder<1);
alter table public.pets add column clean_remainder double precision not null default 0 check(clean_remainder>=0 and clean_remainder<1);
alter table public.pets add column happiness_remainder double precision not null default 0 check(happiness_remainder>=0 and happiness_remainder<1);
create or replace function public.settle_pet(p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update pets set
  energy=greatest(0,energy-floor(energy_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*2)::integer),
  clean=greatest(0,clean-floor(clean_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600)::integer),
  happiness=greatest(0,happiness-floor(happiness_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*1.5)::integer),
  energy_remainder=(energy_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*2)-floor(energy_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*2),
  clean_remainder=(clean_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600)-floor(clean_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600),
  happiness_remainder=(happiness_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*1.5)-floor(happiness_remainder+greatest(0,extract(epoch from(now()-updated_at)))/3600*1.5),
  updated_at=now() where user_id=p_user;
end; $$;

-- One SQL statement gives balances, inventory and pet one consistent snapshot.
create function public.get_user_state(p_user uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'profile',to_jsonb(p), 'pet',(select to_jsonb(c) from pets c where c.user_id=p_user),
  'products',coalesce((select jsonb_agg(to_jsonb(x) order by x.price,x.id) from products x where x.active),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'quantity',i.quantity) order by i.product_id) from inventory i where i.user_id=p_user),'[]'::jsonb),
  'equipped',coalesce((select jsonb_agg(jsonb_build_object('product_id',e.product_id,'slot',e.slot) order by e.slot) from equipped_accessories e where e.user_id=p_user),'[]'::jsonb),
  'collectionCount',(select count(*) from collections c where c.user_id=p_user and c.deleted_at is null)
 ) from profiles p where p.id=p_user;
$$;
create function public.backend_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('schemaVersion',2,'database',true,'catalogReady',(select count(distinct category)=3 from products where active));
$$;

alter table public.upload_jobs add column cleanup_token uuid, add column cleanup_until timestamptz,
 add column attempts integer not null default 0, add column next_attempt_at timestamptz not null default now();
alter table public.storage_gc add column cleanup_token uuid, add column cleanup_until timestamptz,
 add column attempts integer not null default 0, add column next_attempt_at timestamptz not null default now();
create index storage_gc_due on public.storage_gc(next_attempt_at,created_at);
create index upload_cleanup_due on public.upload_jobs(next_attempt_at,touched_at);

create or replace function public.reserve_upload(p_user uuid,p_request uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job upload_jobs; previous operations;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
  if previous.kind<>'collection' or previous.result->>'content_hash' is distinct from p_hash then raise exception 'REQUEST_CONFLICT'; end if;
  return jsonb_build_object('completed',true);
 end if;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request for update;
 if found then
  if job.cleaning then raise exception 'UPLOAD_NOT_READY'; end if;
  if job.content_hash is distinct from p_hash then raise exception 'REQUEST_CONFLICT'; end if;
  update upload_jobs set touched_at=now() where user_id=p_user and request_id=p_request;
 else
  -- A fresh object generation prevents an old cleaner removing a new retry's file.
  insert into upload_jobs(user_id,request_id,photo_path,content_hash)
   values(p_user,p_request,p_user::text||'/'||gen_random_uuid()::text||'.webp',p_hash) returning * into job;
 end if;
 return jsonb_build_object('photo_path',job.photo_path,'completed',false);
end; $$;

drop function public.claim_abandoned_upload(uuid,uuid);
create function public.claim_upload_cleanup(p_user uuid,p_request uuid,p_path text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job upload_jobs; claim uuid:=gen_random_uuid();
begin
 perform 1 from profiles where id=p_user for update;
 select * into job from upload_jobs where user_id=p_user and request_id=p_request and photo_path=p_path for update;
 if not found or job.next_attempt_at>now() or job.cleanup_until>now() or (not job.cleaning and job.touched_at>now()-interval '24 hours') then return null; end if;
 if exists(select 1 from collections where photo_path=job.photo_path) then
  delete from upload_jobs where user_id=p_user and request_id=p_request and photo_path=p_path; return null;
 end if;
 update upload_jobs set cleaning=true,cleanup_token=claim,cleanup_until=now()+interval '5 minutes' where user_id=p_user and request_id=p_request;
 return jsonb_build_object('photo_path',p_path,'token',claim,'user_id',p_user,'request_id',p_request);
end; $$;
create function public.finish_upload_cleanup(p_user uuid,p_request uuid,p_path text,p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 delete from upload_jobs where user_id=p_user and request_id=p_request and photo_path=p_path and cleanup_token=p_token and cleaning;
 return found;
end; $$;
create function public.release_upload_cleanup(p_user uuid,p_request uuid,p_path text,p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update upload_jobs set attempts=attempts+1,cleanup_token=null,cleanup_until=null,
  next_attempt_at=now()+make_interval(secs=>least(600,5*power(2,least(attempts,7)))::integer)
  where user_id=p_user and request_id=p_request and photo_path=p_path and cleanup_token=p_token;
end; $$;

create function public.claim_photo_delete(p_job uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare job storage_gc; claim uuid:=gen_random_uuid();
begin
 select * into job from storage_gc where id=p_job for update;
 if not found or job.next_attempt_at>now() or job.cleanup_until>now() then return null; end if;
 update storage_gc set cleanup_token=claim,cleanup_until=now()+interval '5 minutes' where id=p_job;
 return to_jsonb(job)||jsonb_build_object('token',claim);
end; $$;
drop function public.finish_collection_delete(uuid);
create function public.finish_photo_delete(p_job uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 select collection_id into target from storage_gc where id=p_job;
 if not found then return false; end if;
 -- Match begin_collection_delete's lock order: collection before storage_gc.
 perform 1 from collections where id=target for update;
 delete from storage_gc where id=p_job and cleanup_token=p_token;
 if not found then return false; end if;
 delete from collections where id=target and deleted_at is not null;
 return true;
end; $$;
create function public.release_photo_delete(p_job uuid,p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update storage_gc set attempts=attempts+1,cleanup_token=null,cleanup_until=null,
  next_attempt_at=now()+make_interval(secs=>least(600,5*power(2,least(attempts,7)))::integer)
  where id=p_job and cleanup_token=p_token;
end; $$;

-- New SECURITY DEFINER functions are service-only; clients cannot pass another owner ID.
revoke all on function public.get_user_state(uuid),public.backend_status(),public.claim_upload_cleanup(uuid,uuid,text),public.finish_upload_cleanup(uuid,uuid,text,uuid),public.release_upload_cleanup(uuid,uuid,text,uuid),public.claim_photo_delete(uuid),public.finish_photo_delete(uuid,uuid),public.release_photo_delete(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_user_state(uuid),public.backend_status(),public.claim_upload_cleanup(uuid,uuid,text),public.finish_upload_cleanup(uuid,uuid,text,uuid),public.release_upload_cleanup(uuid,uuid,text,uuid),public.claim_photo_delete(uuid),public.finish_photo_delete(uuid,uuid),public.release_photo_delete(uuid,uuid) to service_role;
