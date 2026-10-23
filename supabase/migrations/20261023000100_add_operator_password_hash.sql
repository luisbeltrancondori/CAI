alter table public.cai_operadores
  add column if not exists contrasena_hash text,
  add column if not exists password_hash text;

notify pgrst, 'reload schema';
