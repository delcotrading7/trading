-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Gestión de riesgo y retiros por cuenta de fondeo
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace: agrega a fondeo_accounts
--   - risk        (jsonb) reglas de la cuenta: drawdown y su tipo
--                 (trailing con traba en el balance inicial / trailing /
--                 estático), RR, reglas de retiro de la firma (desde
--                 ganancia, mínimo, máximo, colchón mínimo) y el colchón a
--                 dejar según tu plan.
--   - withdrawals (jsonb) lista de retiros [{id, date, amount}]: bajan el
--                 balance de la cuenta desde esa fecha.
-- La escalera de SL y el SL máximo de cada etapa van dentro de "stages"
-- (ya existe), no necesitan columna nueva.
-- ════════════════════════════════════════════════════════════════

alter table public.fondeo_accounts
  add column if not exists risk jsonb;

alter table public.fondeo_accounts
  add column if not exists withdrawals jsonb not null default '[]'::jsonb;
