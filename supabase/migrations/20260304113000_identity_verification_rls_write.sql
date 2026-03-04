-- Allow users to create and update their own photo verification attempts.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'identity_verifications'
      and policyname = 'identity_verifications_insert_own'
  ) then
    create policy "identity_verifications_insert_own"
    on public.identity_verifications
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'identity_verifications'
      and policyname = 'identity_verifications_update_own'
  ) then
    create policy "identity_verifications_update_own"
    on public.identity_verifications
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
