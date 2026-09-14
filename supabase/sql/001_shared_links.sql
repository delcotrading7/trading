-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Fase 1: "Compartir día" (links de solo lectura)
-- ════════════════════════════════════════════════════════════════
-- Cómo usar este script:
--   1. Entrá a tu proyecto en supabase.com → SQL Editor → New query.
--   2. Pegá todo este archivo y apretá "Run".
--   3. Es seguro volver a correrlo más de una vez (no rompe nada si
--      ya lo corriste antes).
--
-- Qué hace:
--   - Crea la tabla "shared_links": cada fila es un link para
--     compartir UN día específico (práctica o fondeo).
--   - Activa Row Level Security (RLS) y agrega una política que
--     dice: "cada usuario logueado solo puede ver/crear/borrar SUS
--     PROPIOS links". Nadie sin login (por ejemplo tu mentor con el
--     link) puede leer esta tabla directamente — solo puede acceder
--     a través de la Netlify Function "share-day", que usa una clave
--     especial que nunca se expone en el navegador.
--
-- Esta tabla NO toca practica_days, fondeo_days, ni tus fotos.
-- No hace falta migrar ningún dato existente.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.shared_links (
  token        text primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  source_table text not null check (source_table in ('practica_days','fondeo_days')),
  day_key      text not null,
  permission   text not null default 'view' check (permission in ('view','edit')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days'),
  revoked      boolean not null default false
);

alter table public.shared_links enable row level security;

drop policy if exists "owners manage their shared links" on public.shared_links;
create policy "owners manage their shared links"
  on public.shared_links
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists shared_links_owner_day_idx
  on public.shared_links (owner_id, source_table, day_key);

-- ════════════════════════════════════════════════════════════════
-- IMPORTANTE — Verificación manual (una sola vez, 2 minutos):
--
-- Como tu app usa la clave pública ("anon key") y esa clave está a
-- la vista en tu código en GitHub, es clave confirmar que las
-- tablas practica_days, fondeo_days y el bucket "journal-photos"
-- tengan RLS activado y restringido a tu propio usuario. Si no,
-- cualquiera con la clave pública podría leer TODOS tus días, no
-- solo el que compartís.
--
-- Cómo revisarlo (dashboard de Supabase, sin escribir SQL):
--   1. Table Editor → practica_days → ícono de escudo/RLS arriba →
--      debe decir "RLS enabled" con una política que compare
--      auth.uid() con user_id.
--   2. Repetir para fondeo_days.
--   3. Storage → bucket "journal-photos" → Policies → debe haber
--      una política que restrinja el acceso según el usuario
--      dueño del archivo.
--
-- Si alguna de estas NO tiene RLS activado, avisame antes de seguir
-- y la cerramos juntos — no toqué esas tablas en este script para
-- no arriesgar nada que ya esté funcionando.
-- ════════════════════════════════════════════════════════════════
