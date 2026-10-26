-- Avisos por correo cuando se confirma un pago (una sola vez por pago).
alter table public.pagos add column notificado_at timestamptz;

-- El pack Completo incluye la invitación digital Estándar.
update public.precios_pack
set descripcion = 'Todo lo de Experiencia, más la invitación digital Estándar (diseño a elección entre las muestras).'
where pack = 'completo';
