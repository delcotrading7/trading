-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Cuentas y Etapas de Fondeo
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace:
--   Crea la tabla "fondeo_accounts". Cada fila es una cuenta de fondeo:
--     - category   'PA' o 'Directa'
--     - size       tamaño de la cuenta en USD (ej. 50000)
--     - nickname   apodo opcional (si está vacío se muestra "PA 50k")
--     - start_date / end_date  rango de días de la cuenta (end_date
--                  vacío = cuenta activa). Los días de fondeo_days que
--                  caen en ese rango pertenecen a la cuenta.
--     - stages     lista de etapas (jsonb): nombre, objetivo en USD,
--                  estado y, al cumplirse, fecha + snapshot de balance.
--   Solo puede haber UNA cuenta activa por usuario (índice único).
--   Row Level Security: cada usuario solo ve/edita SUS cuentas.
--
-- Reemplaza al viejo "ciclo de 30 días" (que era solo cálculo en el
-- navegador, no tenía tabla). No toca fondeo_days ni practica_days.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.fondeo_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category     text not null check (category in ('PA','Directa')),
  size         integer not null check (size > 0),
  nickname     text,
  start_date   date not null,
  end_date     date,
  status       text not null default 'active' check (status in ('active','closed')),
  close_reason text,
  stages       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fondeo_accounts_dates_ok check (end_date is null or end_date >= start_date),
  constraint fondeo_accounts_closed_has_end check (status = 'active' or end_date is not null)
);

create unique index if not exists fondeo_accounts_one_active_per_user
  on public.fondeo_accounts (user_id) where status = 'active';

alter table public.fondeo_accounts enable row level security;

drop policy if exists "owners manage their fondeo accounts" on public.fondeo_accounts;
create policy "owners manage their fondeo accounts"
  on public.fondeo_accounts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
