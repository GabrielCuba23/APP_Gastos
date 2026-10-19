-- Ejecutar DESPUÉS de supabase/schema.sql. No borra movimientos ni usuarios.
begin;
create table if not exists public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text not null default '',
 phone text not null default '',
 role text not null default 'client' check (role in ('admin','reseller','client')),
 owner_id uuid references public.account_profiles(user_id),
 status text not null default 'suspended' check (status in ('active','suspended')),
 plan_name text not null default 'Mensual',
 expires_at timestamptz,
 password_change_required boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists account_profiles_owner on public.account_profiles(owner_id);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from anon,authenticated;
grant select on public.account_profiles to authenticated;
grant all on public.account_profiles to service_role;
drop policy if exists "Read own account profile" on public.account_profiles;
create policy "Read own account profile" on public.account_profiles for select to authenticated using (user_id=(select auth.uid()));

create table if not exists public.account_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 action text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.account_events enable row level security;
revoke all on public.account_events from anon,authenticated;
grant all on public.account_events to service_role;
grant usage,select on sequence public.account_events_id_seq to service_role;

-- Mantiene operativas las cuentas existentes con 30 días iniciales; el administrador
-- puede renovarlas. Las nuevas altas públicas no reciben un plan automáticamente.
insert into public.account_profiles(user_id,email,status,plan_name,expires_at)
 select id,coalesce(email,''),'active','Inicial',now()+interval '30 days' from auth.users
 on conflict(user_id) do nothing;
create or replace function public.create_account_profile() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.account_profiles(user_id,email) values(new.id,coalesce(new.email,''));
 return new;
end; $$;
drop trigger if exists on_profile_created on auth.users;
create trigger on_profile_created after insert on auth.users for each row execute procedure public.create_account_profile();

-- Usa solamente datos del servidor, nunca user_metadata editable por el usuario.
create or replace function public.has_finance_access() returns boolean
 language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.account_profiles p
  where p.user_id=auth.uid() and p.status='active' and not p.password_change_required
   and (p.role='admin' or p.expires_at>now())
   and (p.owner_id is null or exists(
     select 1 from public.account_profiles manager where manager.user_id=p.owner_id
      and manager.role in ('admin','reseller') and manager.status='active'
      and (manager.role='admin' or manager.expires_at>now())
   ))
 );
$$;
revoke all on function public.has_finance_access() from public;
grant execute on function public.has_finance_access() to authenticated,service_role;
drop policy if exists "Read own balance" on public.balances;
create policy "Read own balance" on public.balances for select to authenticated
 using (user_id=(select auth.uid()) and (select public.has_finance_access()));

create or replace function public.save_balance(payload jsonb,expected_revision bigint)
 returns bigint language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 if not public.has_finance_access() then raise exception 'Tu acceso no está activo o debes cambiar tu contraseña'; end if;
 if payload is null or payload->>'version' is distinct from '1'
  or coalesce(payload->>'currency','') not in ('PEN','USD','EUR')
  or jsonb_typeof(payload->'entries') is distinct from 'array'
  or octet_length(payload::text)>20000000 then raise exception 'Datos inválidos'; end if;
 update public.balances set data=payload,revision=revision+1
  where user_id=auth.uid() and revision=expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'Los datos cambiaron en otro dispositivo. Actualiza antes de guardar.'; end if;
 return next_revision;
end; $$;
revoke all on function public.save_balance(jsonb,bigint) from public;
grant execute on function public.save_balance(jsonb,bigint) to authenticated;

-- Solo Edge Functions con service_role pueden invocar estas operaciones.
-- La autorización se vuelve a comprobar aquí y la auditoría se guarda en la misma transacción.
create or replace function public.manage_account(actor_id uuid,target_id uuid,operation text,changes jsonb)
 returns void language plpgsql security definer set search_path='' as $$
declare actor public.account_profiles; target public.account_profiles; next_role text;
begin
 select * into actor from public.account_profiles where user_id=actor_id for update;
 select * into target from public.account_profiles where user_id=target_id for update;
 if actor.user_id is null or target.user_id is null then raise exception 'Cuenta no encontrada'; end if;
 if operation='password_changed' then
  if actor_id<>target_id then raise exception 'No autorizado'; end if;
  update public.account_profiles set password_change_required=false,updated_at=now() where user_id=target_id;
 else
  if actor.status<>'active' or actor.password_change_required
   or (actor.role<>'admin' and (actor.role<>'reseller' or actor.expires_at is null or actor.expires_at<=now()))
   then raise exception 'No autorizado'; end if;
  if actor_id=target_id or target.role='admin' then raise exception 'No puedes modificar esta cuenta'; end if;
  if operation='create' then
   next_role=changes->>'role';
   if next_role not in ('client','reseller') or next_role is null then raise exception 'Rol inválido'; end if;
   if actor.role='reseller' and next_role<>'client' then raise exception 'No autorizado'; end if;
   if target.owner_id is not null then raise exception 'Cuenta ya asignada'; end if;
  elsif operation='update' then
   next_role=target.role;
   if actor.role='reseller' and (target.role<>'client' or target.owner_id is distinct from actor_id) then raise exception 'No autorizado'; end if;
  else raise exception 'Operación inválida';
  end if;
  if coalesce(changes->>'status','') not in ('active','suspended') then raise exception 'Estado inválido'; end if;
  if coalesce(changes->>'full_name','')='' or length(changes->>'full_name')>120 or length(coalesce(changes->>'phone',''))>30
   or coalesce(changes->>'plan_name','')='' or length(changes->>'plan_name')>80
   or changes->>'expires_at' is null then raise exception 'Datos inválidos'; end if;
  update public.account_profiles set
   role=next_role,
   owner_id=case when operation='create' then actor_id else owner_id end,
   full_name=changes->>'full_name',phone=coalesce(changes->>'phone',''),
   status=changes->>'status',plan_name=changes->>'plan_name',expires_at=(changes->>'expires_at')::timestamptz,
   password_change_required=case when operation='create' then true else password_change_required end,
   updated_at=now() where user_id=target_id;
 end if;
 insert into public.account_events(actor_id,target_id,action,details)
 values(actor_id,target_id,operation,case when operation='password_changed' then '{}'::jsonb else
  jsonb_build_object('status',changes->>'status','plan_name',changes->>'plan_name','expires_at',changes->>'expires_at') end);
end; $$;
revoke all on function public.manage_account(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_account(uuid,uuid,text,jsonb) to service_role;
commit;
