-- Pruebas de las reglas de seguridad. Cualquier fallo corta con error.
\set ON_ERROR_STOP on

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'anfitrion@ejemplo.com', false),
  ('00000000-0000-0000-0000-00000000000b', null, true),   -- invitado anónimo
  ('00000000-0000-0000-0000-00000000000c', null, true),   -- otro invitado
  ('00000000-0000-0000-0000-00000000000d', null, true);   -- extraño sin unirse

create schema pruebas;
grant usage on schema pruebas to authenticated, anon;

create or replace function pruebas.como(p_user text, p_anon boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
end $$;

create or replace function pruebas.afirmar(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLÓ: %', p_msg; end if;
  raise notice 'ok: %', p_msg;
end $$;

create or replace function pruebas.debe_rechazar(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLÓ: %', p_msg;
exception when insufficient_privilege then
  raise notice 'ok: %', p_msg;
end $$;

grant execute on all functions in schema pruebas to authenticated, anon;

-- 1. El anfitrión crea un evento y queda como miembro.
select pruebas.como('00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
insert into public.events (owner_id, slug, titulo) values
  ('00000000-0000-0000-0000-00000000000a', 'pruebaSlug123', 'Sofi y Martín')
returning id \gset ev_
select pruebas.afirmar((select count(*) = 1 from public.event_members where event_id = :'ev_id'), 'el creador queda como anfitrión');
select pruebas.afirmar((select count(*) = 1 from public.events), 'el anfitrión ve su evento');

-- 2. Un invitado anónimo no puede crear eventos.
select pruebas.como('00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  insert into public.events (owner_id, slug, titulo)
  values ('00000000-0000-0000-0000-00000000000b', 'anonimoSlug1', 'No');
  raise exception 'FALLÓ: un anónimo pudo crear un evento';
exception when insufficient_privilege then
  raise notice 'ok: un anónimo no puede crear eventos';
end $$;

-- 3. El invitado ve los datos públicos por slug, pero no la tabla de eventos.
select pruebas.afirmar((select count(*) = 1 from public.evento_publico('pruebaSlug123')), 'evento_publico encuentra el evento');
select pruebas.afirmar((select count(*) = 0 from public.events), 'el invitado no lista eventos');

-- 4. El invitado se suma con su nombre.
select public.unirse_evento('pruebaSlug123', '  Lucía ') as guest_id \gset g_
select pruebas.afirmar((select invitado_nombre = 'Lucía' from public.evento_publico('pruebaSlug123')), 'el invitado queda registrado con su nombre');

select pruebas.como('00000000-0000-0000-0000-00000000000c', true);
select public.unirse_evento('pruebaSlug123', 'Tomás') as guest_id \gset g2_

-- 5. Fotos creadas por la función (service role): una lista, una pendiente, una oculta.
set role service_role;
insert into public.media (id, event_id, guest_id, user_id, autor_nombre, key_original, key_thumb, estado, oculta) values
  ('10000000-0000-0000-0000-000000000001', :'ev_id', :'g_guest_id', '00000000-0000-0000-0000-00000000000b', 'Lucía', 'k1', 't1', 'lista', false),
  ('10000000-0000-0000-0000-000000000002', :'ev_id', :'g_guest_id', '00000000-0000-0000-0000-00000000000b', 'Lucía', 'k2', 't2', 'pendiente', false),
  ('10000000-0000-0000-0000-000000000003', :'ev_id', :'g_guest_id', '00000000-0000-0000-0000-00000000000b', 'Lucía', 'k3', 't3', 'lista', true);
set role authenticated;

-- 6. Otro invitado ve solo las listas y no ocultas.
select pruebas.afirmar((select count(*) = 1 from public.media), 'otro invitado ve solo fotos listas y visibles');

-- 7. Un invitado no puede insertar ni moderar.
select pruebas.debe_rechazar(
  format('insert into public.media (event_id, user_id, key_original, key_thumb) values (%L, %L, %L, %L)',
         :'ev_id', '00000000-0000-0000-0000-00000000000c', 'x', 'y'),
  'un invitado no inserta media directo');
update public.media set oculta = true where id = '10000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select not oculta from public.media where id = '10000000-0000-0000-0000-000000000001'), 'un invitado no puede ocultar fotos');
set role authenticated;

-- 8. Solo el dueño de la foto la confirma.
select pruebas.afirmar((select public.confirmar_media(array['10000000-0000-0000-0000-000000000002'::uuid]) = 0), 'otro invitado no confirma fotos ajenas');
select pruebas.como('00000000-0000-0000-0000-00000000000b', true);
select pruebas.afirmar((select count(*) = 3 from public.media), 'el autor ve todas sus fotos, incluso pendientes');
select pruebas.afirmar((select public.confirmar_media(array['10000000-0000-0000-0000-000000000002'::uuid]) = 1), 'el autor confirma su foto');

-- 9. Un extraño que no se sumó no ve nada.
select pruebas.como('00000000-0000-0000-0000-00000000000d', true);
select pruebas.afirmar((select count(*) = 0 from public.media), 'un extraño no ve fotos');
select pruebas.afirmar((select count(*) = 0 from public.guests), 'un extraño no ve invitados');

-- 10. El anfitrión ve todo y modera.
select pruebas.como('00000000-0000-0000-0000-00000000000a', false);
select pruebas.afirmar((select count(*) = 3 from public.media), 'el anfitrión ve todas las fotos');
update public.media set oculta = false where id = '10000000-0000-0000-0000-000000000003';
select pruebas.afirmar((select not oculta from public.media where id = '10000000-0000-0000-0000-000000000003'), 'el anfitrión puede mostrar una foto oculta');
select pruebas.afirmar((select count(*) = 2 from public.guests), 'el anfitrión ve a sus invitados');
select pruebas.debe_rechazar(
  'update public.media set key_original = ''otra'' where id = ''10000000-0000-0000-0000-000000000001''',
  'el anfitrión solo puede cambiar la columna oculta');

-- 11. Sin sesión (rol anon) no se accede a nada.
reset role;
set role anon;
select pruebas.debe_rechazar('select count(*) from public.media', 'anon no lee fotos');
select pruebas.debe_rechazar('select count(*) from public.events', 'anon no lee eventos');

reset role;
\echo 'Todas las pruebas de reglas pasaron.'
