-- Puente con Invitaciones Digitales (WordPress): marca del correo "tu invitación está lista".
-- Guarda la URL que ya se le avisó al cliente, para no reenviar el mismo correo si WordPress
-- o la administración repiten la entrega.

alter table public.compras
  add column if not exists invitacion_notificada_url text;

-- Lista del puente: pedidos con invitación todavía sin vínculo con WordPress, en orden estable.
create index if not exists compras_wp_bridge_idx
  on public.compras (updated_at, id)
  where invitation_tier is not null and wordpress_event_id is null;
