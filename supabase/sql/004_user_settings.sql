-- ════════════════════════════════════════════════════════════════
-- Trading Journal — Configuración del journal (TP / SL editables)
-- ════════════════════════════════════════════════════════════════
-- Cómo usar: Supabase → SQL Editor → New query → pegar todo → Run.
-- Seguro de correr más de una vez.
--
-- Qué hace:
--   Crea la tabla "user_settings" con una fila por usuario donde se
--   guardan los montos automáticos de TP y SL que se configuran desde
--   el botón "⚙ Configurar Journal" del menú. Así el valor persiste
--   entre sesiones y dispositivos.
--
--   - tp se guarda siempre POSITIVO (ej. 900)
--   - sl se guarda siempre NEGATIVO (ej. -450)
--
--   Row Level Security: cada usuario solo puede ver/crear/editar SU
--   propia fila.
--
-- No toca practica_days, fondeo_days ni las fotos.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tp         integer not null default 900  check (tp > 0),
  sl         integer not null default -450 check (sl < 0),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "owners manage their settings" on public.user_settings;
create policy "owners manage their settings"
  on public.user_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
