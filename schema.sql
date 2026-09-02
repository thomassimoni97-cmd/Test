-- ============================================================
-- Conference Quiz MVP - Schema Supabase
-- ============================================================
-- Esegui questo file nel SQL Editor di Supabase (Dashboard > SQL Editor).
--
-- ATTENZIONE (scelta da prototipo, NON usare in produzione):
-- le policy qui sotto permettono a chiunque abbia la anon key di:
--   - leggere la sessione demo
--   - aggiornare current_step (cioe' pilotare la conferenza)
--   - inserire risposte
-- Va bene per una demo di conferenza usa-e-getta. In produzione la regia
-- va protetta con autenticazione / service role, e le answers vanno
-- vincolate. Vedi la nota finale.
-- ============================================================

-- ---------- Tabella sessions ----------
-- Una sola riga per questo MVP: id = 'demo'.
create table if not exists public.sessions (
  id           text primary key,
  current_step int  not null default 0,
  status       text not null default 'live'
);

-- Seed della singola sessione demo.
insert into public.sessions (id, current_step, status)
values ('demo', 0, 'live')
on conflict (id) do nothing;

-- ---------- Tabella answers ----------
create table if not exists public.answers (
  id             bigint generated always as identity primary key,
  participant_id text        not null,
  question_id    int         not null,
  answer         text        not null,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.sessions enable row level security;
alter table public.answers  enable row level security;

-- Chiunque (anon) puo' LEGGERE la sessione. Serve ai partecipanti.
create policy "public read sessions"
  on public.sessions for select
  using (true);

-- PROTOTIPO: chiunque (anon) puo' AGGIORNARE current_step.
-- Serve alla cabina di regia (control.html) che non ha login.
-- >>> In produzione NON lasciare questa policy: la regia va autenticata. <<<
create policy "public update sessions (PROTOTYPE ONLY)"
  on public.sessions for update
  using (true)
  with check (true);

-- PROTOTIPO: chiunque (anon) puo' INSERIRE risposte.
create policy "public insert answers (PROTOTYPE ONLY)"
  on public.answers for insert
  with check (true);

-- ============================================================
-- Realtime
-- ============================================================
-- Abilita gli eventi realtime sulla tabella sessions.
-- (Puoi farlo anche dalla UI: Database > Replication > supabase_realtime.)
alter publication supabase_realtime add table public.sessions;
