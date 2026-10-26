-- Fotos que dejan de verse (ocultas o borradas), para avisar en tiempo real.
-- El tiempo real de Supabase no les avisa a los invitados cuando una foto se oculta o se borra
-- (después del cambio ya no tienen permiso para verla). Esta tabla sí la pueden leer,
-- así la galería y la pantalla del salón la sacan al instante.

create table public.media_bajas (
  media_id   uuid primary key,
  event_id   uuid not null,
  motivo     text not null check (motivo in ('oculta', 'borrada')),
  created_at timestamptz not null default now()
);

create index media_bajas_event_idx on public.media_bajas (event_id, created_at);

create or replace function public.registrar_baja()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.media_bajas (media_id, event_id, motivo)
    values (old.id, old.event_id, 'borrada')
    on conflict (media_id) do update set motivo = 'borrada', created_at = now();
    return old;
  end if;

  if new.oculta and not old.oculta then
    insert into public.media_bajas (media_id, event_id, motivo)
    values (new.id, new.event_id, 'oculta')
    on conflict (media_id) do update set motivo = 'oculta', created_at = now();
  elsif old.oculta and not new.oculta then
    delete from public.media_bajas where media_id = new.id and motivo = 'oculta';
  end if;
  return new;
end;
$$;

create trigger media_registrar_baja_borrado
after delete on public.media
for each row execute function public.registrar_baja();

create trigger media_registrar_baja_oculta
after update of oculta on public.media
for each row execute function public.registrar_baja();

alter table public.media_bajas enable row level security;

create policy media_bajas_select on public.media_bajas
  for select to authenticated
  using (public.es_miembro(event_id) or public.es_invitado(event_id));

grant select on public.media_bajas to authenticated;
grant select, insert, update, delete on public.media_bajas to service_role;
revoke all on public.media_bajas from anon;

alter publication supabase_realtime add table public.media_bajas;

-- Para la pantalla del salón: fotos que dejaron de verse desde cierta fecha.
create or replace function public.pantalla_bajas(p_token text, p_desde timestamptz)
returns table (media_id uuid, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select b.media_id, b.created_at
  from public.media_bajas b
  join public.events e on e.id = b.event_id
  where e.pantalla_token = p_token
    and b.created_at > p_desde
  order by b.created_at
  limit 500;
$$;

revoke all on function public.pantalla_bajas(text, timestamptz) from public;
grant execute on function public.pantalla_bajas(text, timestamptz) to anon, authenticated;
revoke all on function public.registrar_baja() from public;
