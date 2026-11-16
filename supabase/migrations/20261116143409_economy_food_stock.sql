-- Reprice future transactions only; existing balances, ownership and receipts stay intact.
insert into public.products(id,name,category,description,price,emoji,effect,archived,active)
values('makanan','Makanan MyMew','food','Satu porsi untuk mangkuk MyMew. Energy +20.',3,'🥣',20,false,true)
on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,emoji=excluded.emoji,effect=excluded.effect,archived=false,active=true;
update public.products set price=3 where category='food';
update public.products set price=50 where id in ('topi-zaitun','topi-merah','topi-krem','topi-putih','topi-hitam');
update public.products set price=70,name=case id when 'topi-navy-logo' then 'Topi Undip' else 'Topi NY' end,
 description=case id when 'topi-navy-logo' then 'Topi navy dengan logo Undip asli.' else 'Topi krem dengan logo NY asli.' end
 where id in ('topi-navy-logo','topi-krem-logo');
update public.products set price=60 where id in ('kacamata-hitam','kacamata-oval','bingkai-putih','bingkai-hitam');

-- Both feeding endpoints share one stock transaction; a receipt protects every portion.
create function public.consume_food(p_user uuid,p_request uuid,p_product text,p_kind text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare previous operations; item pets; food products; stock integer; before_energy integer; result jsonb;
begin
 if p_kind not in ('feed','use') or p_kind is null then raise exception 'REQUEST_CONFLICT'; end if;
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
  if previous.kind<>p_kind or (p_product is not null and previous.result->>'product_id' is distinct from p_product) then raise exception 'REQUEST_CONFLICT'; end if;
  select * into item from pets where user_id=p_user;
  select quantity into stock from inventory where user_id=p_user and product_id=previous.result->>'product_id';
  return jsonb_build_object('pet',to_jsonb(item),'product_id',previous.result->>'product_id','quantity',coalesce(stock,0),'replayed',true,'energy_added',0);
 end if;
 if p_product is null then
  select p.* into food from products p join inventory i on i.product_id=p.id and i.user_id=p_user
   where p.category='food' and i.quantity>0 order by (p.id='makanan') desc,p.id limit 1;
  if not found then raise exception 'FOOD_EMPTY'; end if;
 else
  select * into food from products where id=p_product and category='food';
  if not found then raise exception 'NOT_FOUND'; end if;
 end if;
 select quantity into stock from inventory where user_id=p_user and product_id=food.id for update;
 if coalesce(stock,0)<1 then raise exception 'FOOD_EMPTY'; end if;
 select * into item from pets where user_id=p_user;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.fed_at>now()-interval '30 seconds' then raise exception 'FEED_COOLDOWN'; end if;
 perform settle_pet(p_user);
 select energy into before_energy from pets where user_id=p_user;
 update inventory set quantity=quantity-1 where user_id=p_user and product_id=food.id;
 update pets set energy=least(100,energy+food.effect),fed_at=now() where user_id=p_user returning * into item;
 result:=jsonb_build_object('pet',to_jsonb(item),'product_id',food.id,'quantity',stock-1,'replayed',false,'energy_added',item.energy-before_energy);
 insert into operations values(p_user,p_request,p_kind,result,now());
 return result;
end; $$;
revoke all on function public.consume_food(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.feed_pet_food(p_user uuid,p_request uuid,p_product text) returns jsonb
language sql security definer set search_path=public as $$
 select public.consume_food(p_user,p_request,p_product,'feed');
$$;
revoke all on function public.feed_pet_food(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.feed_pet_food(uuid,uuid,text) to service_role;

-- Keep old backend retries compatible, while removing the former free-food path.
create or replace function public.feed_pet(p_user uuid,p_request uuid) returns jsonb
language sql security definer set search_path=public as $$
 select public.feed_pet_food(p_user,p_request,null);
$$;

create or replace function public.use_product(p_user uuid,p_product text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare product products; stock integer; previous operations; result jsonb;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into product from products where id=p_product and category in ('food','care');
 if not found then raise exception 'NOT_FOUND'; end if;
 if product.category='food' then return public.consume_food(p_user,p_request,p_product,'use'); end if;
 select * into previous from operations where user_id=p_user and request_id=p_request;
 if found then
  if previous.kind<>'use' or previous.result->>'product_id'<>p_product then raise exception 'REQUEST_CONFLICT'; end if;
  return previous.result||jsonb_build_object('replayed',true);
 end if;
 select quantity into stock from inventory where user_id=p_user and product_id=p_product for update;
 if coalesce(stock,0)<1 then raise exception 'OUT_OF_STOCK'; end if;
 perform settle_pet(p_user);
 update inventory set quantity=quantity-1 where user_id=p_user and product_id=p_product;
 update pets set clean=least(100,clean+product.effect) where user_id=p_user;
 result:=jsonb_build_object('product_id',p_product,'quantity',stock-1);
 insert into operations values(p_user,p_request,'use',result,now());
 return result;
end; $$;

create or replace function public.backend_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('schemaVersion',5,'database',true,'catalogReady',
  (select count(*)=12 and bool_and(price=case when id='makanan' then 3 when id in ('topi-navy-logo','topi-krem-logo') then 70 when slot='face' then 60 else 50 end)
   from products where active and not archived and id in ('makanan','topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam'))
  and (select category='food' and effect=20 from products where id='makanan')
  and not exists(select 1 from products where active and not archived and id not in ('makanan','topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih','topi-navy-logo','topi-putih','topi-krem-logo','topi-hitam','bingkai-hitam')));
$$;
