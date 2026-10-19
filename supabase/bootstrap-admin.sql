-- Ejecutar una sola vez después de la migración de reventas.
-- Reemplaza TU_CORREO_AQUI por el correo de la cuenta que ya creaste y confirmaste.
-- Este archivo no crea contraseñas ni elimina movimientos.
begin;
do $$
declare target_id uuid;
begin
 select id into target_id from auth.users where lower(email)=lower('TU_CORREO_AQUI');
 if target_id is null then raise exception 'No existe ese correo. Reemplaza TU_CORREO_AQUI por tu cuenta registrada.'; end if;
 if not exists(select 1 from public.account_profiles where user_id=target_id) then raise exception 'Ejecuta primero la migración de reventas.'; end if;
 update public.account_profiles set role='admin',status='active',owner_id=null,expires_at=null,password_change_required=false,updated_at=now() where user_id=target_id;
end $$;
commit;
