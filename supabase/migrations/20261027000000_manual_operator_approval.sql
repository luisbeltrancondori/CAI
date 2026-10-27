alter table public.cai_operadores
  add column if not exists cedula text,
  add column if not exists estado text;

update public.cai_operadores
   set estado = 'activo'
 where estado is null;

alter table public.cai_operadores
  alter column estado set default 'pendiente',
  alter column estado set not null;

alter table public.cai_operadores
  drop constraint if exists cai_operadores_estado_check;

alter table public.cai_operadores
  add constraint cai_operadores_estado_check
  check (estado in ('pendiente', 'activo', 'rechazado'));

create unique index if not exists cai_operadores_cedula_lower_uidx
  on public.cai_operadores (lower(trim(cedula)))
  where cedula is not null and length(trim(cedula)) > 0;

alter table public.cai_operadores enable row level security;
revoke all on table public.cai_operadores from anon, authenticated;

drop function if exists public.cai_operador_login(text, text);
create function public.cai_operador_login(
  p_usuario text,
  p_contrasena text
)
returns table (
  id uuid,
  nombre_completo text,
  telefono text,
  establecimiento_id uuid,
  establecimiento_nombre text,
  usuario text,
  estado text
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
           operador.usuario,
           operador.estado
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

drop function if exists public.cai_operador_registrar(text, text, uuid, text, text);
create function public.cai_operador_registrar(
  p_nombre_completo text,
  p_cedula text,
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
  usuario text,
  estado text
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

  if coalesce(length(trim(p_cedula)), 0) = 0 then
    raise exception 'Ingrese el número de cédula.' using errcode = '22023';
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
    cedula,
    telefono,
    establecimiento_id,
    usuario,
    contrasena_hash,
    password_hash,
    estado
  )
  values (
    trim(p_nombre_completo),
    trim(p_cedula),
    nullif(trim(coalesce(p_telefono, '')), ''),
    p_establecimiento_id,
    trim(p_usuario),
    password_digest,
    password_digest,
    'pendiente'
  )
  returning cai_operadores.id into operador_id;

  return query
    select operador.id,
           operador.nombre_completo,
           operador.telefono,
           operador.establecimiento_id,
           establecimiento.nombre,
           operador.usuario,
           operador.estado
      from public.cai_operadores as operador
      join public.cai_establecimientos as establecimiento
        on establecimiento.id = operador.establecimiento_id
     where operador.id = operador_id;
end;
$$;

create table if not exists public.cai_administradores (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cai_administradores enable row level security;
revoke all on table public.cai_administradores from anon, authenticated;

create or replace function public.cai_admin_es_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.cai_administradores as administrador
     where administrador.auth_user_id = auth.uid()
  );
$$;

create or replace function public.cai_admin_solicitudes_pendientes()
returns table (
  id uuid,
  nombre_completo text,
  cedula text,
  telefono text,
  establecimiento_nombre text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.cai_admin_es_autorizado() then
    raise exception 'No tiene permisos para administrar las solicitudes.' using errcode = '42501';
  end if;

  return query
    select operador.id,
           operador.nombre_completo,
           operador.cedula,
           operador.telefono,
           establecimiento.nombre,
           operador.created_at
      from public.cai_operadores as operador
      join public.cai_establecimientos as establecimiento
        on establecimiento.id = operador.establecimiento_id
     where operador.estado = 'pendiente'
     order by operador.created_at asc;
end;
$$;

create or replace function public.cai_admin_resolver_solicitud(
  p_operador_id uuid,
  p_aprobar boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nuevo_estado text;
begin
  if not public.cai_admin_es_autorizado() then
    raise exception 'No tiene permisos para administrar las solicitudes.' using errcode = '42501';
  end if;

  if p_aprobar is null then
    raise exception 'Debe indicar si la solicitud se aprueba o se rechaza.' using errcode = '22023';
  end if;

  nuevo_estado := case when p_aprobar then 'activo' else 'rechazado' end;

  update public.cai_operadores
     set estado = nuevo_estado
   where id = p_operador_id
     and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud ya fue procesada o no existe.' using errcode = 'P0002';
  end if;

  return nuevo_estado;
end;
$$;

revoke all on function public.cai_operador_login(text, text) from public;
revoke all on function public.cai_operador_registrar(text, text, text, uuid, text, text) from public;
revoke all on function public.cai_admin_es_autorizado() from public, anon;
revoke all on function public.cai_admin_solicitudes_pendientes() from public, anon;
revoke all on function public.cai_admin_resolver_solicitud(uuid, boolean) from public, anon;

grant execute on function public.cai_operador_login(text, text) to anon, authenticated;
grant execute on function public.cai_operador_registrar(text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.cai_admin_es_autorizado() to authenticated;
grant execute on function public.cai_admin_solicitudes_pendientes() to authenticated;
grant execute on function public.cai_admin_resolver_solicitud(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
