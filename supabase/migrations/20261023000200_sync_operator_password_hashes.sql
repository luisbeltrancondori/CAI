create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.cai_operadores
  add column if not exists contrasena_hash text,
  add column if not exists password_hash text;

update public.cai_operadores
   set password_hash = coalesce(nullif(password_hash, ''), contrasena_hash),
       contrasena_hash = coalesce(nullif(contrasena_hash, ''), password_hash)
 where password_hash is null
    or contrasena_hash is null;

create or replace function public.cai_operador_login(
  p_usuario text,
  p_contrasena text
)
returns table (
  id uuid,
  nombre_completo text,
  telefono text,
  establecimiento_id uuid,
  establecimiento_nombre text,
  usuario text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(trim(p_usuario), '') = '' or coalesce(p_contrasena, '') = '' then
    raise exception 'Usuario o contraseña incorrectos.' using errcode = '28000';
  end if;

  return query
    select operador.id,
           operador.nombre_completo,
           operador.telefono,
           operador.establecimiento_id,
           establecimiento.nombre,
           operador.usuario
      from public.cai_operadores as operador
      join public.cai_establecimientos as establecimiento
        on establecimiento.id = operador.establecimiento_id
     where lower(operador.usuario) = lower(trim(p_usuario))
       and coalesce(nullif(operador.password_hash, ''), operador.contrasena_hash) =
           extensions.crypt(
             p_contrasena,
             coalesce(nullif(operador.password_hash, ''), operador.contrasena_hash)
           );

  if not found then
    raise exception 'Usuario o contraseña incorrectos.' using errcode = '28000';
  end if;
end;
$$;

create or replace function public.cai_operador_registrar(
  p_nombre_completo text,
  p_telefono text,
  p_establecimiento_id uuid,
  p_usuario text,
  p_contrasena text
)
returns table (
  id uuid,
  nombre_completo text,
  telefono text,
  establecimiento_id uuid,
  establecimiento_nombre text,
  usuario text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  operador_id uuid;
  password_digest text;
begin
  if coalesce(length(trim(p_nombre_completo)), 0) = 0 then
    raise exception 'Ingrese el nombre completo del operador.' using errcode = '22023';
  end if;

  if coalesce(length(trim(p_usuario)), 0) = 0 then
    raise exception 'Ingrese un nombre de usuario.' using errcode = '22023';
  end if;

  if p_contrasena is null or length(p_contrasena) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  password_digest := extensions.crypt(p_contrasena, extensions.gen_salt('bf', 12));

  insert into public.cai_operadores (
    nombre_completo,
    telefono,
    establecimiento_id,
    usuario,
    contrasena_hash,
    password_hash
  )
  values (
    trim(p_nombre_completo),
    nullif(trim(coalesce(p_telefono, '')), ''),
    p_establecimiento_id,
    trim(p_usuario),
    password_digest,
    password_digest
  )
  returning cai_operadores.id into operador_id;

  return query
    select operador.id,
           operador.nombre_completo,
           operador.telefono,
           operador.establecimiento_id,
           establecimiento.nombre,
           operador.usuario
      from public.cai_operadores as operador
      join public.cai_establecimientos as establecimiento
        on establecimiento.id = operador.establecimiento_id
     where operador.id = operador_id;
end;
$$;

notify pgrst, 'reload schema';
