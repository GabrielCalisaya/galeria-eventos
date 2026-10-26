-- Imitación mínima de lo que Supabase trae de fábrica, para probar
-- la migración en un Postgres común (lo usa la verificación automática de GitHub).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create publication supabase_realtime;

-- Simula "Automatically expose new tables" desactivado: las tablas nuevas
-- no reciben permisos automáticos, así que las migraciones tienen que darlos.
revoke all on schema public from public;

-- service_role en Supabase puede usar las secuencias y saltear RLS.
grant service_role to postgres;
