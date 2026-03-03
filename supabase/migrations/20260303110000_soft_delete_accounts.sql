-- Soft-delete support for recoverable account deletion.
alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_restore_until timestamptz;

