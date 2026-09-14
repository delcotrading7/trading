-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Fase 3: modo "Edición" en links compartidos
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace:
--   Crea "shared_annotations": cada comentario o dibujo de un mentor
--   es UNA FILA NUEVA (nunca se actualiza una fila existente). Así,
--   si varias personas usan el mismo link de edición, todo se va
--   acumulando sin pisarse.
--
--   RLS: vos (el dueño) podés leer y borrar tus propias filas desde
--   tu cuenta logueada. Nadie puede insertar filas directo (ni con
--   login ni sin login) — todo pasa por la Netlify Function
--   "share-day", que valida el link antes de escribir, usando la
--   clave de servicio (nunca expuesta en el navegador).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.shared_annotations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  source_table text not null check (source_table in ('practica_days','fondeo_days')),
  day_key      text not null,
  link_token   text,
  type         text not null check (type in ('comment','drawing')),
  author_name  text,
  comment_text text,
  photo_path   text,
  image_path   text,
  created_at   timestamptz not null default now()
);

alter table public.shared_annotations enable row level security;

drop policy if exists "owners read their shared annotations" on public.shared_annotations;
create policy "owners read their shared annotations"
  on public.shared_annotations
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "owners delete their shared annotations" on public.shared_annotations;
create policy "owners delete their shared annotations"
  on public.shared_annotations
  for delete
  to authenticated
  using (auth.uid() = owner_id);

create index if not exists shared_annotations_owner_day_idx
  on public.shared_annotations (owner_id, source_table, day_key, created_at desc);
