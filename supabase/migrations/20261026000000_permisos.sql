-- Permisos explícitos para el proyecto con "Automatically expose new tables" desactivado.
-- Supabase ya no da acceso automático a las tablas nuevas: cada rol recibe solo
-- lo que la app necesita, y las reglas de seguridad (RLS) siguen decidiendo qué filas ve cada uno.

grant usage on schema public to anon, authenticated, service_role;

-- Anfitriones: sus eventos.
grant select, insert, update, delete on public.events to authenticated;

-- Miembros del evento (anfitrión y coanfitriones).
grant select, insert, update, delete on public.event_members to authenticated;

-- Invitados: solo lectura; el alta pasa por unirse_evento().
grant select on public.guests to authenticated;

-- Fotos: leer, y moderar únicamente la columna "oculta".
-- El alta la hace la función sign-upload con service_role.
grant select on public.media to authenticated;
grant update (oculta) on public.media to authenticated;

-- La función de subida usa service_role (no sujeto a RLS, pero sí necesita permisos de tabla).
grant select, insert, update, delete on public.events, public.event_members, public.guests, public.media to service_role;

-- Funciones auxiliares que usan las reglas de seguridad.
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_invitado(uuid) to authenticated;

-- anon (sin sesión) no necesita nada: los invitados entran con sesión anónima,
-- que en Supabase usa el rol authenticated.
revoke all on public.events, public.event_members, public.guests, public.media from anon;
