-- Botón de arrepentimiento (Resolución 424/2020): solicitudes con código de seguimiento.
-- Se cargan solo desde la función "arrepentimiento" (service_role); nadie más las lee.

create table public.arrepentimientos (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 200),
  telefono   text,
  referencia text,
  motivo     text,
  estado     text not null default 'recibido' check (estado in ('recibido', 'en_proceso', 'resuelto')),
  created_at timestamptz not null default now()
);

create index arrepentimientos_email_idx on public.arrepentimientos (email, created_at);

alter table public.arrepentimientos enable row level security;
revoke all on public.arrepentimientos from anon, authenticated;
grant select, insert, update, delete on public.arrepentimientos to service_role;
