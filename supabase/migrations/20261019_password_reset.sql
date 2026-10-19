-- Ejecutar después de la migración de reventas. Puede repetirse; no borra datos.
begin;
create or replace function public.prepare_account_password_reset(actor_id uuid,target_id uuid)
 returns text language plpgsql security definer set search_path='' as $$
declare actor public.account_profiles; target public.account_profiles; target_email text;
begin
 select * into actor from public.account_profiles where user_id=actor_id for update;
 select * into target from public.account_profiles where user_id=target_id for update;
 if actor.user_id is null or target.user_id is null then raise exception 'Cuenta no encontrada'; end if;
 if actor.status<>'active' or actor.password_change_required
  or (actor.role<>'admin' and (actor.role<>'reseller' or actor.expires_at is null or actor.expires_at<=now())) then raise exception 'No autorizado'; end if;
 if actor_id=target_id or target.role='admin' then raise exception 'No puedes modificar esta cuenta'; end if;
 if actor.role='reseller' and (target.role<>'client' or target.owner_id is distinct from actor_id) then raise exception 'No autorizado'; end if;
 select email into target_email from auth.users where id=target_id;
 if target_email is null then raise exception 'No se encontró el correo de acceso'; end if;
 update public.account_profiles set email=target_email,password_change_required=true,updated_at=now() where user_id=target_id;
 insert into public.account_events(actor_id,target_id,action,details)
 values(actor_id,target_id,'password_reset_requested','{}');
 return target_email;
end; $$;
revoke all on function public.prepare_account_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_account_password_reset(uuid,uuid) to service_role;
commit;
