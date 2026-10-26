-- Pantalla del salón y trivia de la pareja.

-- ─────────────────────────────────────────────────────────────
-- Pantalla del salón: link secreto propio, distinto del QR de invitados
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column pantalla_token text not null unique
  default replace(gen_random_uuid()::text, '-', '');

-- Datos del evento para la pantalla (no requiere sesión: se abre en la notebook del salón).
create or replace function public.pantalla_evento(p_token text)
returns table (id uuid, slug text, titulo text, fecha date, estilo jsonb)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.slug, e.titulo, e.fecha, e.estilo
  from public.events e
  where e.pantalla_token = p_token and e.estado in ('activo', 'finalizado');
$$;

-- Fotos visibles para la pantalla. Con p_desde trae solo las más nuevas que esa fecha.
create or replace function public.pantalla_fotos(p_token text, p_desde timestamptz default null)
returns table (id uuid, key_original text, key_thumb text, autor_nombre text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.key_original, m.key_thumb, m.autor_nombre, m.created_at
  from public.media m
  join public.events e on e.id = m.event_id
  where e.pantalla_token = p_token
    and e.estado in ('activo', 'finalizado')
    and m.estado = 'lista'
    and not m.oculta
    and (p_desde is null or m.created_at > p_desde)
  order by m.created_at desc
  limit 300;
$$;

-- ─────────────────────────────────────────────────────────────
-- Trivia
-- ─────────────────────────────────────────────────────────────

create table public.trivia_preguntas (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  orden      integer not null default 0,
  texto      text not null check (char_length(btrim(texto)) between 1 and 200),
  opciones   text[] not null check (array_length(opciones, 1) between 2 and 4),
  correcta   integer not null,
  created_at timestamptz not null default now(),
  check (correcta >= 0 and correcta < array_length(opciones, 1))
);

create index trivia_preguntas_event_idx on public.trivia_preguntas (event_id, orden, created_at);

-- Estado del juego en vivo: una fila por evento.
create table public.trivia_estado (
  event_id    uuid primary key references public.events (id) on delete cascade,
  fase        text not null default 'espera'
              check (fase in ('espera', 'pregunta', 'resultado', 'ranking', 'fin')),
  pregunta_id uuid references public.trivia_preguntas (id) on delete set null,
  numero      integer not null default 0,
  total       integer not null default 0,
  inicio      timestamptz,
  duracion    integer not null default 20 check (duracion between 5 and 120),
  actualizado timestamptz not null default now()
);

create table public.trivia_respuestas (
  pregunta_id uuid not null references public.trivia_preguntas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  opcion      integer not null,
  ms          integer not null,
  puntos      integer not null,
  created_at  timestamptz not null default now(),
  primary key (pregunta_id, user_id)
);

create index trivia_respuestas_event_idx on public.trivia_respuestas (event_id, user_id);

alter table public.trivia_preguntas enable row level security;
alter table public.trivia_estado enable row level security;
alter table public.trivia_respuestas enable row level security;

-- Preguntas: solo los miembros (incluye la respuesta correcta, que los invitados no deben ver).
create policy trivia_preguntas_miembros on public.trivia_preguntas
  for all to authenticated
  using (public.es_miembro(event_id))
  with check (public.es_miembro(event_id));

-- Estado: lo leen miembros e invitados (no tiene datos sensibles); se cambia por RPC.
create policy trivia_estado_select on public.trivia_estado
  for select to authenticated
  using (public.es_miembro(event_id) or public.es_invitado(event_id));

-- Respuestas: cada uno ve las suyas; los miembros, todas. Se cargan por RPC.
create policy trivia_respuestas_select on public.trivia_respuestas
  for select to authenticated
  using (user_id = auth.uid() or public.es_miembro(event_id));

grant select, insert, update, delete on public.trivia_preguntas to authenticated;
grant select on public.trivia_estado to authenticated;
grant select on public.trivia_respuestas to authenticated;
grant select, insert, update, delete on public.trivia_preguntas, public.trivia_estado, public.trivia_respuestas to service_role;
revoke all on public.trivia_preguntas, public.trivia_estado, public.trivia_respuestas from anon;

alter publication supabase_realtime add table public.trivia_estado;

-- Pregunta número n (1, 2, 3…) del evento, según el orden elegido por el anfitrión.
create or replace function public.trivia_pregunta_n(p_event uuid, p_n integer)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.trivia_preguntas
  where event_id = p_event
  order by orden, created_at
  offset greatest(p_n - 1, 0) limit 1;
$$;

-- Control del juego (solo miembros): iniciar, cerrar, siguiente, ranking, terminar.
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

-- Un invitado responde la pregunta en curso. Una sola respuesta por pregunta.
-- Puntaje: 0 si es incorrecta; si es correcta, de 1000 (al instante) a 500 (al final del tiempo).
create or replace function public.trivia_responder(p_event uuid, p_opcion integer)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado   public.trivia_estado;
  v_correcta integer;
  v_ms       integer;
  v_puntos   integer;
  v_insertadas integer;
begin
  if not public.es_invitado(p_event) then
    raise exception 'Primero entrá a la galería con tu nombre' using errcode = '42501';
  end if;

  select * into v_estado from public.trivia_estado where event_id = p_event;
  if not found or v_estado.fase <> 'pregunta' or v_estado.pregunta_id is null then
    raise exception 'No hay ninguna pregunta abierta' using errcode = 'P0001';
  end if;

  v_ms := (extract(epoch from (now() - v_estado.inicio)) * 1000)::integer;
  if v_ms > v_estado.duracion * 1000 + 1500 then
    raise exception 'Se terminó el tiempo' using errcode = 'P0001';
  end if;

  select correcta into v_correcta from public.trivia_preguntas where id = v_estado.pregunta_id;
  v_puntos := case
    when p_opcion = v_correcta
      then 500 + round(500 * greatest(0, 1 - v_ms::numeric / (v_estado.duracion * 1000)))::integer
    else 0
  end;

  insert into public.trivia_respuestas (pregunta_id, user_id, event_id, opcion, ms, puntos)
  values (v_estado.pregunta_id, auth.uid(), p_event, p_opcion, greatest(v_ms, 0), v_puntos)
  on conflict do nothing;
  get diagnostics v_insertadas = row_count;
  return v_insertadas = 1;
end;
$$;

-- Estado completo del juego en JSON. La respuesta correcta y los conteos
-- solo aparecen después de cerrar la pregunta.
create or replace function public.trivia_json(p_event uuid, p_user uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_estado  public.trivia_estado;
  v_preg    public.trivia_preguntas;
  v_revelar boolean;
  v_ranking json;
  v_conteos json;
  v_mia     json;
  v_yo      json;
begin
  select * into v_estado from public.trivia_estado where event_id = p_event;
  if not found then
    return json_build_object('fase', 'espera', 'ahora', now());
  end if;

  select * into v_preg from public.trivia_preguntas where id = v_estado.pregunta_id;
  v_revelar := v_estado.fase in ('resultado', 'ranking', 'fin');

  if v_revelar and v_preg.id is not null then
    select coalesce(json_agg(
             (select count(*) from public.trivia_respuestas r
              where r.pregunta_id = v_preg.id and r.opcion = g.n)
             order by g.n), '[]'::json)
    into v_conteos
    from generate_series(0, array_length(v_preg.opciones, 1) - 1) as g(n);
  end if;

  select coalesce(json_agg(json_build_object('nombre', nombre, 'puntos', puntos) order by puntos desc, ms), '[]'::json)
  into v_ranking
  from (
    select g.nombre, sum(r.puntos)::integer as puntos, sum(r.ms) as ms
    from public.trivia_respuestas r
    join public.guests g on g.user_id = r.user_id and g.event_id = r.event_id
    where r.event_id = p_event
    group by r.user_id, g.nombre
    order by sum(r.puntos) desc, sum(r.ms)
    limit 5
  ) t;

  if p_user is not null then
    if v_preg.id is not null then
      select json_build_object('opcion', r.opcion, 'puntos', case when v_revelar then r.puntos end)
      into v_mia
      from public.trivia_respuestas r
      where r.pregunta_id = v_preg.id and r.user_id = p_user;
    end if;

    select json_build_object('puntos', t.puntos, 'posicion', t.posicion)
    into v_yo
    from (
      select r.user_id, sum(r.puntos)::integer as puntos,
             rank() over (order by sum(r.puntos) desc, sum(r.ms)) as posicion
      from public.trivia_respuestas r
      where r.event_id = p_event
      group by r.user_id
    ) t
    where t.user_id = p_user;
  end if;

  return json_build_object(
    'fase', v_estado.fase,
    'numero', v_estado.numero,
    'total', v_estado.total,
    'duracion', v_estado.duracion,
    'inicio', v_estado.inicio,
    'ahora', now(),
    'pregunta', case when v_preg.id is not null and v_estado.fase in ('pregunta', 'resultado')
                     then json_build_object('id', v_preg.id, 'texto', v_preg.texto, 'opciones', v_preg.opciones)
                end,
    'correcta', case when v_revelar then v_preg.correcta end,
    'conteos', v_conteos,
    'respuestas', (select count(*) from public.trivia_respuestas r where r.pregunta_id = v_preg.id),
    'ranking', case when v_estado.fase in ('ranking', 'fin', 'resultado') then v_ranking end,
    'mi_respuesta', v_mia,
    'yo', v_yo
  );
end;
$$;

-- Para el celular del invitado o del anfitrión.
create or replace function public.trivia_actual(p_event uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.es_invitado(p_event) or public.es_miembro(p_event)) then
    raise exception 'No formás parte de este evento' using errcode = '42501';
  end if;
  return public.trivia_json(p_event, auth.uid());
end;
$$;

-- Para la pantalla del salón (por su link secreto).
create or replace function public.trivia_pantalla(p_token text)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_event uuid;
begin
  select id into v_event from public.events where pantalla_token = p_token;
  if v_event is null then
    return null;
  end if;
  return public.trivia_json(v_event, null);
end;
$$;

-- Permisos de ejecución
revoke all on function public.pantalla_evento(text) from public;
revoke all on function public.pantalla_fotos(text, timestamptz) from public;
revoke all on function public.trivia_pregunta_n(uuid, integer) from public;
revoke all on function public.trivia_control(uuid, text, integer) from public;
revoke all on function public.trivia_responder(uuid, integer) from public;
revoke all on function public.trivia_json(uuid, uuid) from public;
revoke all on function public.trivia_actual(uuid) from public;
revoke all on function public.trivia_pantalla(text) from public;

grant execute on function public.pantalla_evento(text) to anon, authenticated;
grant execute on function public.pantalla_fotos(text, timestamptz) to anon, authenticated;
grant execute on function public.trivia_pantalla(text) to anon, authenticated;
grant execute on function public.trivia_control(uuid, text, integer) to authenticated;
grant execute on function public.trivia_responder(uuid, integer) to authenticated;
grant execute on function public.trivia_actual(uuid) to authenticated;
