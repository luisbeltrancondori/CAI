alter table public.cai_registros_mensuales
  add column if not exists valor_denominador numeric;

notify pgrst, 'reload schema';
