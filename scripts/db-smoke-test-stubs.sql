-- Minimal stand-ins for the parts of Supabase's platform schema our migrations
-- reference (auth.*, storage.*). Used only to syntax/reference-check the
-- migrations locally; never applied to a real Supabase project (which already
-- provides the real versions of these).
create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_anonymous boolean not null default false
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select current_setting('request.jwt.claim.sub', true)::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
