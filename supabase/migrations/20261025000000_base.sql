-- Fase Base: eventos, anfitriones, invitados y fotos.
-- Los invitados entran con sesión anónima de Supabase (sin cuenta ni email),
-- así cada celular tiene su propio auth.uid() y las reglas de seguridad lo usan.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-zA-Z0-9]{8,32}$'),
  titulo        text not null check (char_length(titulo) between 1 and 120),
  fecha         date,
  tipo          text not null default 'casamiento'
                check (tipo in ('casamiento', 'quince', 'cumpleanos', 'aniversario', 'corporativo', 'otro')),
  estilo        jsonb not null default '{}'::jsonb,
  pack          text not null default 'basico' check (pack in ('basico', 'experiencia', 'completo')),
  -- Mientras no esté el cobro (fase 3), los eventos nacen activos para poder probar.
  estado        text not null default 'activo'
                check (estado in ('borrador', 'activo', 'finalizado', 'vencido')),
  limite_fotos  integer not null default 1500 check (limite_fotos > 0),
  vence_album   date,
  created_at    timestamptz not null default now()
);

create table public.event_members (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rol        text not null default 'anfitrion' check (rol in ('anfitrion', 'coanfitrion')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.guests (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.media (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  guest_id      uuid references public.guests (id) on delete set null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  autor_nombre  text not null default '',
  tipo          text not null default 'foto' check (tipo in ('foto', 'video')),
  key_original  text not null,
  key_thumb     text not null,
  ancho         integer,
  alto          integer,
  bytes         integer,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'lista')),
  oculta        boolean not null default false,
  created_at    timestamptz not null default now()
);

create index media_event_created_idx on public.media (event_id, created_at desc);
create index media_user_created_idx on public.media (user_id, created_at desc);
create index guests_user_idx on public.guests (user_id);
create index event_members_user_idx on public.event_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- Funciones auxiliares (security definer para evitar recursión en RLS)
-- ─────────────────────────────────────────────────────────────

create or replace function public.es_miembro(p_event uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_members
    where event_id = p_event and user_id = auth.uid()
  );
$$;

create or replace function public.es_invitado(p_event uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guests
    where event_id = p_event and user_id = auth.uid()
  );
$$;

-- El creador del evento queda como anfitrión automáticamente.
create or replace function public.agregar_anfitrion()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.event_members (event_id, user_id, rol)
  values (new.id, new.owner_id, 'anfitrion')
  on conflict do nothing;
  return new;
end;
$$;

create trigger events_agregar_anfitrion
after insert on public.events
for each row execute function public.agregar_anfitrion();

-- ─────────────────────────────────────────────────────────────
-- RPC para invitados
-- ─────────────────────────────────────────────────────────────

-- Datos públicos de un evento a partir del slug del QR.
-- Devuelve también el invitado actual si este celular ya se sumó.
create or replace function public.evento_publico(p_slug text)
returns table (
  id uuid, titulo text, fecha date, tipo text, estilo jsonb, estado text,
  invitado_id uuid, invitado_nombre text
)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.titulo, e.fecha, e.tipo, e.estilo, e.estado, g.id, g.nombre
  from public.events e
  left join public.guests g on g.event_id = e.id and g.user_id = auth.uid()
  where e.slug = p_slug and e.estado in ('activo', 'finalizado');
$$;

-- Suma (o renombra) al invitado de este celular. Solo con el evento activo.
create or replace function public.unirse_evento(p_slug text, p_nombre text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_event uuid;
  v_guest uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;

  select id into v_event from public.events
  where slug = p_slug and estado = 'activo';
  if v_event is null then
    raise exception 'El evento no existe o no está activo' using errcode = 'P0002';
  end if;

  insert into public.guests (event_id, user_id, nombre)
  values (v_event, auth.uid(), btrim(p_nombre))
  on conflict (event_id, user_id) do update set nombre = excluded.nombre
  returning id into v_guest;

  return v_guest;
end;
$$;

-- El invitado marca como lista una foto suya cuando terminó de subirla.
create or replace function public.confirmar_media(p_ids uuid[])
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.media
  set estado = 'lista'
  where id = any (p_ids) and user_id = auth.uid() and estado = 'pendiente';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Reglas de seguridad (RLS)
-- ─────────────────────────────────────────────────────────────

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.guests enable row level security;
alter table public.media enable row level security;

-- events: solo los miembros ven y editan; crear solo con cuenta real (no anónima).
create policy events_select on public.events
  for select to authenticated
  -- owner_id va primero: al crear, la fila del anfitrión todavía no existe
  -- cuando se evalúa el RETURNING del insert.
  using (owner_id = auth.uid() or public.es_miembro(id));

create policy events_insert on public.events
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy events_update on public.events
  for update to authenticated
  using (public.es_miembro(id))
  with check (public.es_miembro(id));

create policy events_delete on public.events
  for delete to authenticated
  using (owner_id = auth.uid());

-- event_members: cada uno ve los miembros de sus eventos; el dueño administra.
create policy members_select on public.event_members
  for select to authenticated
  using (public.es_miembro(event_id));

create policy members_owner_all on public.event_members
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- guests: el propio invitado y los miembros del evento. Alta solo vía unirse_evento().
create policy guests_select on public.guests
  for select to authenticated
  using (user_id = auth.uid() or public.es_miembro(event_id));

-- media: alta solo desde la función sign-upload (service role).
-- Invitados ven las fotos listas y no ocultas de su evento, más las propias.
create policy media_select on public.media
  for select to authenticated
  using (
    public.es_miembro(event_id)
    or user_id = auth.uid()
    or (estado = 'lista' and not oculta and public.es_invitado(event_id))
  );

-- Solo los miembros moderan (ocultar / mostrar).
create policy media_update on public.media
  for update to authenticated
  using (public.es_miembro(event_id))
  with check (public.es_miembro(event_id));

-- Permisos de ejecución de las RPC
revoke all on function public.evento_publico(text) from public;
revoke all on function public.unirse_evento(text, text) from public;
revoke all on function public.confirmar_media(uuid[]) from public;
grant execute on function public.evento_publico(text) to authenticated;
grant execute on function public.unirse_evento(text, text) to authenticated;
grant execute on function public.confirmar_media(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Tiempo real: la galería escucha altas y cambios de fotos
-- ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.media;
