-- Preserve existing pet state and ownership while adding the Figma appearance catalogue.
alter table public.pets
 add column cat_type_id text not null default 'oyen' constraint pets_cat_type_id_check check(cat_type_id in ('oyen','mujair','hitam','putih')),
 add column room_id text not null default 'hangat' constraint pets_room_id_check check(room_id in ('hangat','senja','rimbun'));
alter table public.products add column archived boolean not null default false;
alter table public.products drop constraint products_slot_check;
alter table public.products add constraint products_slot_check check(slot in ('neck','head','face'));
alter table public.equipped_accessories drop constraint equipped_accessories_slot_check;
alter table public.equipped_accessories add constraint equipped_accessories_slot_check check(slot in ('neck','head','face'));

-- Keep all historical products, purchases, inventory and equipped rows.
update public.products set archived=true where id in ('bandana','bow','flower');
insert into public.products(id,name,category,description,price,emoji,effect,slot) values
 ('topi-zaitun','Topi zaitun','accessory','Topi zaitun untuk penampilan MyMew.',60,'🧢',0,'head'),
 ('topi-merah','Topi merah','accessory','Topi merah untuk penampilan MyMew.',60,'🧢',0,'head'),
 ('topi-krem','Topi krem','accessory','Topi krem untuk penampilan MyMew.',60,'🧢',0,'head'),
 ('kacamata-hitam','Kacamata hitam','accessory','Kacamata hitam untuk penampilan MyMew.',50,'🕶️',0,'face'),
 ('kacamata-oval','Kacamata oval','accessory','Kacamata oval untuk penampilan MyMew.',50,'👓',0,'face'),
 ('bingkai-putih','Bingkai putih','accessory','Bingkai putih untuk penampilan MyMew.',50,'👓',0,'face')
on conflict(id) do update set name=excluded.name,description=excluded.description,price=excluded.price,emoji=excluded.emoji,effect=excluded.effect,slot=excluded.slot,archived=false,active=true;

create or replace function public.buy_product(p_user uuid,p_product text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
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
 if product.archived then raise exception 'ARCHIVED_PRODUCT'; end if;
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

-- One transaction validates all requested items before touching either cosmetic slot.
create function public.equip_loadout(p_user uuid,p_products text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare selected_count integer; selected_slots integer;
begin
 perform 1 from profiles where id=p_user for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p_products is null or cardinality(p_products)>2 or array_position(p_products,null) is not null then raise exception 'INVALID_LOADOUT'; end if;
 select count(*),count(distinct slot) into selected_count,selected_slots from products where id=any(p_products) and category='accessory' and slot in ('head','face');
 if selected_count<>cardinality(p_products) or selected_slots<>cardinality(p_products) then raise exception 'INVALID_LOADOUT'; end if;
 if exists(select 1 from unnest(p_products) as choice(id) left join inventory i on i.product_id=choice.id and i.user_id=p_user where coalesce(i.quantity,0)<1) then raise exception 'OUT_OF_STOCK'; end if;
 delete from equipped_accessories where user_id=p_user and slot in ('head','face');
 insert into equipped_accessories(user_id,slot,product_id) select p_user,slot,id from products where id=any(p_products);
 return jsonb_build_object('equipped',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'slot',slot) order by slot) from equipped_accessories where user_id=p_user),'[]'::jsonb));
end; $$;
revoke all on function public.equip_loadout(uuid,text[]) from public,anon,authenticated;
grant execute on function public.equip_loadout(uuid,text[]) to service_role;

create or replace function public.backend_status() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('schemaVersion',3,'database',true,'catalogReady',
  (select count(distinct category)=3 from products where active and not archived)
  and (select count(*)=6 from products where active and not archived and id in ('topi-zaitun','topi-merah','topi-krem','kacamata-hitam','kacamata-oval','bingkai-putih')));
$$;
