-- Compras de invitación, galería o ambos productos con una sola referencia de pago.
-- El flujo existente de pagos por evento se conserva sin cambios.

create table public.precios_invitacion (
  nivel text primary key check (nivel in ('standard', 'premium', 'deluxe')),
  nombre text not null,
  descripcion text not null default '',
  precio numeric(12, 2) not null check (precio > 0),
  moneda text not null default 'ARS',
  orden integer not null default 0,
  activo boolean not null default true
);

insert into public.precios_invitacion (nivel, nombre, descripcion, precio, moneda, orden) values
  ('standard', 'Estándar', 'Invitación digital Estándar.', 25000, 'ARS', 1),
  ('premium', 'Premium', 'Invitación digital Premium.', 30000, 'ARS', 2),
  ('deluxe', 'Deluxe', 'Invitación digital Deluxe.', 35000, 'ARS', 3);

alter table public.precios_invitacion enable row level security;
create policy precios_invitacion_lectura on public.precios_invitacion
  for select to anon, authenticated using (activo);
grant select on public.precios_invitacion to anon, authenticated;
grant select, insert, update, delete on public.precios_invitacion to service_role;

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 80),
  titulo_evento text not null check (char_length(btrim(titulo_evento)) between 1 and 120),
  tipo_evento text not null check (tipo_evento in ('casamiento', 'quince', 'cumpleanos', 'aniversario', 'corporativo', 'otro')),
  fecha_evento date,
  gallery_pack text check (gallery_pack in ('basico', 'experiencia', 'completo')),
  invitation_tier text check (invitation_tier in ('standard', 'premium', 'deluxe')),
  productos jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null check (subtotal > 0),
  descuento numeric(12, 2) not null default 0 check (descuento >= 0),
  total numeric(12, 2) not null check (total > 0),
  moneda text not null default 'ARS',
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'transferencia_pendiente', 'pagada', 'preparando', 'entregada', 'cancelada', 'reembolsada')),
  datos_invitacion jsonb not null default '{}'::jsonb,
  datos_completos boolean not null default false,
  url_invitacion text,
  email_notificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (gallery_pack is not null or invitation_tier is not null)
);

create index compras_user_created_idx on public.compras (user_id, created_at desc);
create index compras_estado_created_idx on public.compras (estado, created_at desc);
create index compras_event_idx on public.compras (event_id) where event_id is not null;
alter table public.compras enable row level security;
create policy compras_lectura_propietario on public.compras
  for select to authenticated using (user_id = auth.uid());
grant select on public.compras to authenticated;
revoke all on public.compras from anon;
grant select, insert, update, delete on public.compras to service_role;

create table public.compra_pagos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  metodo text not null check (metodo in ('mercado_pago', 'transferencia')),
  numero_transferencia text,
  monto numeric(12, 2) not null check (monto > 0),
  moneda text not null default 'ARS',
  mp_preference_id text unique,
  mp_init_point text,
  mp_payment_id text unique,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'en_proceso', 'rechazado', 'cancelado', 'devuelto')),
  detalle text,
  notificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index compra_pagos_compra_idx on public.compra_pagos (compra_id, created_at desc);
create unique index compra_pagos_un_pago_abierto on public.compra_pagos (compra_id)
  where estado in ('pendiente', 'en_proceso');
alter table public.compra_pagos enable row level security;
create policy compra_pagos_lectura_propietario on public.compra_pagos
  for select to authenticated using (user_id = auth.uid());
grant select on public.compra_pagos to authenticated;
revoke all on public.compra_pagos from anon;
grant select, insert, update, delete on public.compra_pagos to service_role;
