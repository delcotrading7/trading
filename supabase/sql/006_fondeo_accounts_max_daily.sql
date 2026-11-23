-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Ganancia máxima por día (por cuenta de fondeo)
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace:
--   Agrega a fondeo_accounts la columna opcional "max_daily_profit":
--   lo máximo que se puede ganar en un día en esa cuenta (USD). Vacío =
--   sin límite. El journal avisa cuando un día lo supera y no deja
--   configurar un TP de etapa mayor a ese valor.
-- ════════════════════════════════════════════════════════════════

alter table public.fondeo_accounts
  add column if not exists max_daily_profit integer
  check (max_daily_profit is null or max_daily_profit > 0);
