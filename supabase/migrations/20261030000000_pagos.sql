-- Cobro con Mercado Pago (Checkout Pro).
-- Los eventos nuevos nacen en borrador y se activan cuando Mercado Pago confirma el pago.

-- ─────────────────────────────────────────────────────────────
-- Packs y precios (editables desde el panel de Supabase, tabla precios_pack)
-- ─────────────────────────────────────────────────────────────

create table public.precios_pack (
  pack         text primary key check (pack in ('basico', 'experiencia', 'completo')),
  nombre       text not null,
  descripcion  text not null default '',
  precio       numeric(12, 2) not null check (precio > 0),
  moneda       text not null default 'ARS',
  limite_fotos integer not null check (limite_fotos > 0),
  meses_album  integer not null check (meses_album > 0),
  orden        integer not null default 0,
  activo       boolean not null default true
);

insert into public.precios_pack (pack, nombre, descripcion, precio, limite_fotos, meses_album, orden) values
  ('basico', 'Básico', 'Galería con QR para tus invitados, hasta 1.500 fotos y descarga en .zip.', 25000, 1500, 6, 1),
  ('experiencia', 'Experiencia', 'Todo lo del Básico, más pantalla del salón en vivo, trivia y tarjetas de mesa. Hasta 5.000 fotos.', 45000, 5000, 12, 2),
  ('completo', 'Completo', 'Todo lo de Experiencia, más la invitación digital personalizada.', 65000, 5000, 12, 3);

alter table public.precios_pack enable row level security;

create policy precios_pack_lectura on public.precios_pack
  for select to anon, authenticated
  using (activo);

grant select on public.precios_pack to anon, authenticated;
grant select, insert, update, delete on public.precios_pack to service_role;

-- ─────────────────────────────────────────────────────────────
-- Pagos
-- ─────────────────────────────────────────────────────────────

create table public.pagos (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  pack             text not null,
  monto            numeric(12, 2) not null,
  moneda           text not null default 'ARS',
  mp_preference_id text,
  mp_payment_id    text unique,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'aprobado', 'en_proceso', 'rechazado', 'cancelado', 'devuelto')),
  detalle          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index pagos_event_idx on public.pagos (event_id, created_at desc);

alter table public.pagos enable row level security;

create policy pagos_select on public.pagos
  for select to authenticated
  using (public.es_miembro(event_id));

grant select on public.pagos to authenticated;
grant select, insert, update, delete on public.pagos to service_role;
revoke all on public.pagos from anon;

-- ─────────────────────────────────────────────────────────────
-- Eventos: nacen en borrador. Los que ya existían quedan activos y completos.
-- ─────────────────────────────────────────────────────────────

update public.events set pack = 'completo' where estado = 'activo';
alter table public.events alter column estado set default 'borrador';

-- El anfitrión no puede activarse ni cambiarse el pack solo: eso lo hace el pago (service_role).
create or replace function public.proteger_campos_de_pago()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.estado := 'borrador';
      new.pack := 'basico';
      new.limite_fotos := 1500;
      new.vence_album := null;
    else
      new.estado := old.estado;
      new.pack := old.pack;
      new.limite_fotos := old.limite_fotos;
      new.vence_album := old.vence_album;
    end if;
  end if;
  return new;
end;
$$;

create trigger events_proteger_campos_de_pago
before insert or update on public.events
for each row execute function public.proteger_campos_de_pago();

-- La pantalla del salón y la trivia vienen en los packs Experiencia y Completo.
create or replace function public.pack_incluye_extras(p_event uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events
    where id = p_event and estado in ('activo', 'finalizado') and pack in ('experiencia', 'completo')
  );
$$;

create or replace function public.pantalla_evento(p_token text)
returns table (id uuid, slug text, titulo text, fecha date, estilo jsonb)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.slug, e.titulo, e.fecha, e.estilo
  from public.events e
  where e.pantalla_token = p_token
    and e.estado in ('activo', 'finalizado')
    and e.pack in ('experiencia', 'completo');
$$;

-- trivia_control: misma lógica que antes, ahora exige un pack con extras.
create or replace function public.trivia_control(p_event uuid, p_accion text, p_duracion integer default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado public.trivia_estado;
  v_total  integer;
begin
  if not public.es_miembro(p_event) then
    raise exception 'Solo los anfitriones manejan la trivia' using errcode = '42501';
  end if;
  if not public.pack_incluye_extras(p_event) then
    raise exception 'La trivia viene en los packs Experiencia y Completo' using errcode = 'P0001';
  end if;

  insert into public.trivia_estado (event_id) values (p_event) on conflict do nothing;
  select * into v_estado from public.trivia_estado where event_id = p_event for update;

  if p_accion = 'iniciar' then
    select count(*) into v_total from public.trivia_preguntas where event_id = p_event;
    if v_total = 0 then
      raise exception 'Cargá al menos una pregunta' using errcode = 'P0001';
    end if;
    delete from public.trivia_respuestas where event_id = p_event;
    update public.trivia_estado set
      fase = 'pregunta', numero = 1, total = v_total,
      pregunta_id = public.trivia_pregunta_n(p_event, 1),
      inicio = now(),
      duracion = coalesce(p_duracion, duracion),
      actualizado = now()
    where event_id = p_event;

  elsif p_accion = 'cerrar' then
    update public.trivia_estado set fase = 'resultado', actualizado = now()
    where event_id = p_event and fase = 'pregunta';

  elsif p_accion = 'siguiente' then
    if v_estado.numero < v_estado.total then
      update public.trivia_estado set
        fase = 'pregunta', numero = v_estado.numero + 1,
        pregunta_id = public.trivia_pregunta_n(p_event, v_estado.numero + 1),
        inicio = now(), actualizado = now()
      where event_id = p_event;
    else
      update public.trivia_estado set fase = 'fin', actualizado = now() where event_id = p_event;
    end if;

  elsif p_accion = 'ranking' then
    update public.trivia_estado set fase = 'ranking', actualizado = now() where event_id = p_event;

  elsif p_accion = 'terminar' then
    update public.trivia_estado set
      fase = 'espera', numero = 0, pregunta_id = null, inicio = null, actualizado = now()
    where event_id = p_event;

  else
    raise exception 'Acción desconocida' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.pack_incluye_extras(uuid) from public;
grant execute on function public.pack_incluye_extras(uuid) to authenticated;
revoke all on function public.pantalla_evento(text) from public;
grant execute on function public.pantalla_evento(text) to anon, authenticated;
revoke all on function public.trivia_control(uuid, text, integer) from public;
grant execute on function public.trivia_control(uuid, text, integer) to authenticated;
revoke all on function public.proteger_campos_de_pago() from public;
