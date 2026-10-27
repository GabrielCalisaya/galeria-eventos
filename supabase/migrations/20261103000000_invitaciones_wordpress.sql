alter table public.compras
  add column if not exists tipo_invitacion text check (tipo_invitacion in ('wedding', 'birthday', 'xv')),
  add column if not exists wordpress_event_id bigint,
  add column if not exists wordpress_slug text,
  add column if not exists wordpress_url text,
  add column if not exists wordpress_edit_url text,
  add column if not exists invitacion_sync_estado text not null default 'pendiente'
    check (invitacion_sync_estado in ('pendiente', 'preparando', 'error', 'sin_aplica')),
  add column if not exists invitacion_sync_error text,
  add column if not exists invitacion_sync_at timestamptz;

update public.compras
set tipo_invitacion = case
  when tipo_evento in ('casamiento', 'aniversario') then 'wedding'
  when tipo_evento = 'quince' then 'xv'
  when tipo_evento = 'cumpleanos' then 'birthday'
  else tipo_invitacion
end
where invitation_tier is not null and tipo_invitacion is null;

create index if not exists compras_invitacion_sync_idx
  on public.compras (invitacion_sync_estado, updated_at desc)
  where invitation_tier is not null;
