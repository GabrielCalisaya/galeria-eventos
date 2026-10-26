-- Trivia: al cerrar cada pregunta, quiénes acertaron (del más rápido al más lento).

create or replace function public.trivia_json(p_event uuid, p_user uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_estado   public.trivia_estado;
  v_preg     public.trivia_preguntas;
  v_revelar  boolean;
  v_ranking  json;
  v_conteos  json;
  v_aciertos json;
  v_mia      json;
  v_yo       json;
  v_jugadores integer;
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

    select coalesce(json_agg(json_build_object('nombre', t.nombre, 'ms', t.ms, 'puntos', t.puntos) order by t.ms), '[]'::json)
    into v_aciertos
    from (
      select g.nombre, r.ms, r.puntos
      from public.trivia_respuestas r
      join public.guests g on g.user_id = r.user_id and g.event_id = r.event_id
      where r.pregunta_id = v_preg.id and r.opcion = v_preg.correcta
      order by r.ms
      limit 30
    ) t;
  end if;

  select count(distinct r.user_id) into v_jugadores
  from public.trivia_respuestas r where r.event_id = p_event;

  select coalesce(json_agg(json_build_object('nombre', nombre, 'puntos', puntos) order by puntos desc, ms), '[]'::json)
  into v_ranking
  from (
    select g.nombre, sum(r.puntos)::integer as puntos, sum(r.ms) as ms
    from public.trivia_respuestas r
    join public.guests g on g.user_id = r.user_id and g.event_id = r.event_id
    where r.event_id = p_event
    group by r.user_id, g.nombre
    order by sum(r.puntos) desc, sum(r.ms)
    limit 10
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
    'aciertos', v_aciertos,
    'respuestas', (select count(*) from public.trivia_respuestas r where r.pregunta_id = v_preg.id),
    'jugadores', v_jugadores,
    'ranking', case when v_estado.fase in ('ranking', 'fin', 'resultado') then v_ranking end,
    'mi_respuesta', v_mia,
    'yo', v_yo
  );
end;
$$;

revoke all on function public.trivia_json(uuid, uuid) from public;
