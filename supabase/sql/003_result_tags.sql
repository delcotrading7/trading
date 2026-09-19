-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Etiquetas NE / Día Lateral combinables
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace:
--   Agrega dos columnas booleanas a practica_days y fondeo_days para
--   que "NE — Sin entrada" y "Día Lateral" puedan marcarse como
--   etiquetas adicionales combinables con TP/BE/SL/SP, en vez de ser
--   parte del resultado principal excluyente (main_result).
-- ════════════════════════════════════════════════════════════════

alter table public.practica_days
  add column if not exists ne boolean not null default false;
alter table public.practica_days
  add column if not exists lt boolean not null default false;

alter table public.fondeo_days
  add column if not exists ne boolean not null default false;
alter table public.fondeo_days
  add column if not exists lt boolean not null default false;
