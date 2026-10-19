-- Ejecutar una vez en el editor SQL de tu proyecto Supabase.
create table if not exists public.balances (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{"version":1,"currency":"PEN","entries":[]}'::jsonb,
 revision bigint not null default 0
);
alter table public.balances enable row level security;
create policy "Read own balance" on public.balances for select to authenticated using ((select auth.uid()) = user_id);
-- Las escrituras solo se permiten mediante la función, con control de versión.
revoke all on public.balances from anon, authenticated;
grant select on public.balances to authenticated;
create or replace function public.save_balance(payload jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
 if payload->>'version' <> '1' or payload->>'currency' not in ('PEN','USD','EUR') or jsonb_typeof(payload->'entries') is distinct from 'array' or octet_length(payload::text)>20000000 then raise exception 'Datos inválidos'; end if;
 update public.balances set data=payload, revision=revision+1 where user_id=auth.uid() and revision=expected_revision returning revision into next_revision;
 if next_revision is null then raise exception 'Los datos cambiaron en otro dispositivo. Actualiza antes de guardar.'; end if;
 return next_revision;
end; $$;
revoke all on function public.save_balance(jsonb,bigint) from public;
grant execute on function public.save_balance(jsonb,bigint) to authenticated;
create or replace function public.create_balance() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.balances(user_id) values(new.id); return new; end; $$;
create trigger on_account_created after insert on auth.users for each row execute procedure public.create_balance();
-- Inicializa también las cuentas que ya existen.
insert into public.balances(user_id) select id from auth.users on conflict do nothing;
